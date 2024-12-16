import {
  type EpochProofQuote,
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockSource,
  type ProcessedTx,
  SequencerConfigSchema,
  Tx,
  type TxHash,
  type TxValidator,
  type WorldStateSynchronizer,
} from '@aztec/circuit-types';
import type { AllowedElement, Signature, WorldStateSynchronizerStatus } from '@aztec/circuit-types/interfaces';
import { type L2BlockBuiltStats } from '@aztec/circuit-types/stats';
import {
  AppendOnlyTreeSnapshot,
  BlockHeader,
  ContentCommitment,
  GENESIS_ARCHIVE_ROOT,
  type GlobalVariables,
  StateReference,
} from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { omit } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { pickFromSchema } from '@aztec/foundation/schemas';
import { Timer, elapsed } from '@aztec/foundation/timer';
import { type P2P } from '@aztec/p2p';
import { type BlockBuilderFactory } from '@aztec/prover-client/block-builder';
import { type PublicProcessorFactory } from '@aztec/simulator';
import { Attributes, type TelemetryClient, type Tracer, trackSpan } from '@aztec/telemetry-client';
import { type ValidatorClient } from '@aztec/validator-client';

import { type GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import { type L1Publisher } from '../publisher/l1-publisher.js';
import { prettyLogViemErrorMsg } from '../publisher/utils.js';
import { type TxValidatorFactory } from '../tx_validator/tx_validator_factory.js';
import { type SequencerConfig } from './config.js';
import { SequencerMetrics } from './metrics.js';
import { SequencerState, getSecondsIntoSlot, orderAttestations } from './utils.js';

export type ShouldProposeArgs = {
  pendingTxsCount?: number;
  validTxsCount?: number;
  processedTxsCount?: number;
};

export class SequencerTooSlowError extends Error {
  constructor(
    public readonly currentState: SequencerState,
    public readonly proposedState: SequencerState,
    public readonly maxAllowedTime: number,
    public readonly currentTime: number,
  ) {
    super(
      `Too far into slot to transition to ${proposedState}. max allowed: ${maxAllowedTime}s, time into slot: ${currentTime}s`,
    );
    this.name = 'SequencerTooSlowError';
  }
}

/**
 * Sequencer client
 * - Wins a period of time to become the sequencer (depending on finalized protocol).
 * - Chooses a set of txs from the tx pool to be in the rollup.
 * - Simulate the rollup of txs.
 * - Adds proof requests to the request pool (not for this milestone).
 * - Receives results to those proofs from the network (repeats as necessary) (not for this milestone).
 * - Publishes L1 tx(s) to the rollup contract via RollupPublisher.
 */
export class Sequencer {
  private runningPromise?: RunningPromise;
  private pollingIntervalMs: number = 1000;
  private maxTxsPerBlock = 32;
  private minTxsPerBLock = 1;
  private minSecondsBetweenBlocks = 0;
  private maxSecondsBetweenBlocks = 0;
  // TODO: zero values should not be allowed for the following 2 values in PROD
  private _coinbase = EthAddress.ZERO;
  private _feeRecipient = AztecAddress.ZERO;
  private state = SequencerState.STOPPED;
  private allowedInSetup: AllowedElement[] = [];
  private maxBlockSizeInBytes: number = 1024 * 1024;
  private metrics: SequencerMetrics;
  private isFlushing: boolean = false;

  /**
   * The maximum number of seconds that the sequencer can be into a slot to transition to a particular state.
   * For example, in order to transition into WAITING_FOR_ATTESTATIONS, the sequencer can be at most 3 seconds into the slot.
   */
  protected timeTable!: Record<SequencerState, number>;
  protected enforceTimeTable: boolean = false;

  constructor(
    private publisher: L1Publisher,
    private validatorClient: ValidatorClient | undefined, // During migration the validator client can be inactive
    private globalsBuilder: GlobalVariableBuilder,
    private p2pClient: P2P,
    private worldState: WorldStateSynchronizer,
    private blockBuilderFactory: BlockBuilderFactory,
    private l2BlockSource: L2BlockSource,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private publicProcessorFactory: PublicProcessorFactory,
    private txValidatorFactory: TxValidatorFactory,
    protected l1GenesisTime: number,
    private aztecSlotDuration: number,
    telemetry: TelemetryClient,
    private config: SequencerConfig = {},
    private log = createLogger('sequencer'),
  ) {
    this.updateConfig(config);
    this.metrics = new SequencerMetrics(telemetry, () => this.state, 'Sequencer');

    // Register the block builder with the validator client for re-execution
    this.validatorClient?.registerBlockBuilder(this.buildBlock.bind(this));
  }

  get tracer(): Tracer {
    return this.metrics.tracer;
  }

  /**
   * Updates sequencer config.
   * @param config - New parameters.
   */
  public updateConfig(config: SequencerConfig) {
    this.log.info(
      `Sequencer config set`,
      omit(pickFromSchema(this.config, SequencerConfigSchema), 'allowedInSetup', 'allowedInTeardown'),
    );

    if (config.transactionPollingIntervalMS !== undefined) {
      this.pollingIntervalMs = config.transactionPollingIntervalMS;
    }
    if (config.maxTxsPerBlock !== undefined) {
      this.maxTxsPerBlock = config.maxTxsPerBlock;
    }
    if (config.minTxsPerBlock !== undefined) {
      this.minTxsPerBLock = config.minTxsPerBlock;
    }
    if (config.minSecondsBetweenBlocks !== undefined) {
      this.minSecondsBetweenBlocks = config.minSecondsBetweenBlocks;
    }
    if (config.maxSecondsBetweenBlocks !== undefined) {
      this.maxSecondsBetweenBlocks = config.maxSecondsBetweenBlocks;
    }
    if (config.coinbase) {
      this._coinbase = config.coinbase;
    }
    if (config.feeRecipient) {
      this._feeRecipient = config.feeRecipient;
    }
    if (config.allowedInSetup) {
      this.allowedInSetup = config.allowedInSetup;
    }
    if (config.maxBlockSizeInBytes !== undefined) {
      this.maxBlockSizeInBytes = config.maxBlockSizeInBytes;
    }
    if (config.governanceProposerPayload) {
      this.publisher.setPayload(config.governanceProposerPayload);
    }
    this.enforceTimeTable = config.enforceTimeTable === true;

    this.setTimeTable();

    // TODO: Just read everything from the config object as needed instead of copying everything into local vars.
    this.config = config;
  }

  private setTimeTable() {
    const newTimeTable: Record<SequencerState, number> = {
      [SequencerState.STOPPED]: this.aztecSlotDuration,
      [SequencerState.IDLE]: this.aztecSlotDuration,
      [SequencerState.SYNCHRONIZING]: this.aztecSlotDuration,
      [SequencerState.PROPOSER_CHECK]: this.aztecSlotDuration, // We always want to allow the full slot to check if we are the proposer
      [SequencerState.WAITING_FOR_TXS]: 5,
      [SequencerState.CREATING_BLOCK]: 7,
      [SequencerState.PUBLISHING_BLOCK_TO_PEERS]: 7 + this.maxTxsPerBlock * 2, // if we take 5 seconds to create block, then 4 transactions at 2 seconds each
      [SequencerState.WAITING_FOR_ATTESTATIONS]: 7 + this.maxTxsPerBlock * 2 + 3, // it shouldn't take 3 seconds to publish to peers
      [SequencerState.PUBLISHING_BLOCK]: 7 + this.maxTxsPerBlock * 2 + 3 + 5, // wait 5 seconds for attestations
    };
    if (this.enforceTimeTable && newTimeTable[SequencerState.PUBLISHING_BLOCK] > this.aztecSlotDuration) {
      throw new Error('Sequencer cannot publish block in less than a slot');
    }
    this.timeTable = newTimeTable;
  }

  /**
   * Starts the sequencer and moves to IDLE state.
   */
  public start() {
    this.runningPromise = new RunningPromise(this.work.bind(this), this.log, this.pollingIntervalMs);
    this.setState(SequencerState.IDLE, 0n, true /** force */);
    this.runningPromise.start();
    this.log.info(`Sequencer started with address ${this.publisher.getSenderAddress().toString()}`);
    return Promise.resolve();
  }

  /**
   * Stops the sequencer from processing txs and moves to STOPPED state.
   */
  public async stop(): Promise<void> {
    this.log.debug(`Stopping sequencer`);
    await this.validatorClient?.stop();
    await this.runningPromise?.stop();
    this.publisher.interrupt();
    this.setState(SequencerState.STOPPED, 0n, true /** force */);
    this.log.info('Stopped sequencer');
  }

  /**
   * Starts a previously stopped sequencer.
   */
  public restart() {
    this.log.info('Restarting sequencer');
    this.publisher.restart();
    this.runningPromise!.start();
    this.setState(SequencerState.IDLE, 0n, true /** force */);
  }

  /**
   * Returns the current state of the sequencer.
   * @returns An object with a state entry with one of SequencerState.
   */
  public status() {
    return { state: this.state };
  }

  /**
   * @notice  Performs most of the sequencer duties:
   *          - Checks if we are up to date
   *          - If we are and we are the sequencer, collect txs and build a block
   *          - Collect attestations for the block
   *          - Submit block
   *          - If our block for some reason is not included, revert the state
   */
  protected async doRealWork() {
    this.setState(SequencerState.SYNCHRONIZING, 0n);
    // Update state when the previous block has been synced
    const prevBlockSynced = await this.isBlockSynced();
    // Do not go forward with new block if the previous one has not been mined and processed
    if (!prevBlockSynced) {
      return;
    }

    this.setState(SequencerState.PROPOSER_CHECK, 0n);

    const chainTip = await this.l2BlockSource.getBlock(-1);
    const historicalHeader = chainTip?.header;

    const newBlockNumber =
      (historicalHeader === undefined
        ? await this.l2BlockSource.getBlockNumber()
        : Number(historicalHeader.globalVariables.blockNumber.toBigInt())) + 1;

    // If we cannot find a tip archive, assume genesis.
    const chainTipArchive =
      chainTip == undefined ? new Fr(GENESIS_ARCHIVE_ROOT).toBuffer() : chainTip?.archive.root.toBuffer();

    let slot: bigint;
    try {
      slot = await this.mayProposeBlock(chainTipArchive, BigInt(newBlockNumber));
    } catch (err) {
      this.log.debug(`Cannot propose for block ${newBlockNumber}`);
      return;
    }

    const newGlobalVariables = await this.globalsBuilder.buildGlobalVariables(
      new Fr(newBlockNumber),
      this._coinbase,
      this._feeRecipient,
      slot,
    );

    void this.publisher.castVote(slot, newGlobalVariables.timestamp.toBigInt());

    if (!this.shouldProposeBlock(historicalHeader, {})) {
      return;
    }

    this.log.verbose(`Preparing proposal for block ${newBlockNumber} at slot ${slot}`, {
      chainTipArchive: new Fr(chainTipArchive),
      blockNumber: newBlockNumber,
      slot,
    });

    this.setState(SequencerState.WAITING_FOR_TXS, slot);

    // Get txs to build the new block.
    const pendingTxs = await this.p2pClient.getPendingTxs();

    if (!this.shouldProposeBlock(historicalHeader, { pendingTxsCount: pendingTxs.length })) {
      return;
    }

    // If I created a "partial" header here that should make our job much easier.
    const proposalHeader = new BlockHeader(
      new AppendOnlyTreeSnapshot(Fr.fromBuffer(chainTipArchive), 1),
      ContentCommitment.empty(),
      StateReference.empty(),
      newGlobalVariables,
      Fr.ZERO,
      Fr.ZERO,
    );

    // TODO: It should be responsibility of the P2P layer to validate txs before passing them on here
    const allValidTxs = await this.takeValidTxs(
      pendingTxs,
      this.txValidatorFactory.validatorForNewTxs(newGlobalVariables, this.allowedInSetup),
    );

    // TODO: We are taking the size of the tx from private-land, but we should be doing this after running
    // public functions. Only reason why we do it here now is because the public processor and orchestrator
    // are set up such that they require knowing the total number of txs in advance. Still, main reason for
    // exceeding max block size in bytes is contract class registration, which happens in private-land. This
    // may break if we start emitting lots of log data from public-land.
    const validTxs = this.takeTxsWithinMaxSize(allValidTxs);

    this.log.verbose(
      `Collected ${validTxs.length} txs out of ${allValidTxs.length} valid txs out of ${pendingTxs.length} total pending txs for block ${newBlockNumber}`,
    );

    // Bail if we don't have enough valid txs
    if (!this.shouldProposeBlock(historicalHeader, { validTxsCount: validTxs.length })) {
      return;
    }

    try {
      // @note  It is very important that the following function will FAIL and not just return early
      //        if it have made any state changes. If not, we won't rollback the state, and you will
      //        be in for a world of pain.
      await this.buildBlockAndAttemptToPublish(validTxs, proposalHeader, historicalHeader);
    } catch (err) {
      this.log.error(`Error assembling block`, err, { blockNumber: newBlockNumber, slot });
    }
    this.setState(SequencerState.IDLE, 0n);
  }

  @trackSpan('Sequencer.work')
  protected async work() {
    try {
      await this.doRealWork();
    } catch (err) {
      if (err instanceof SequencerTooSlowError) {
        this.log.warn(err.message);
      } else {
        // Re-throw other errors
        throw err;
      }
    } finally {
      this.setState(SequencerState.IDLE, 0n);
    }
  }

  /** Whether to skip the check of min txs per block if more than maxSecondsBetweenBlocks has passed since the previous block. */
  private skipMinTxsPerBlockCheck(historicalHeader: BlockHeader | undefined): boolean {
    const lastBlockTime = historicalHeader?.globalVariables.timestamp.toNumber() || 0;
    const currentTime = Math.floor(Date.now() / 1000);
    const elapsed = currentTime - lastBlockTime;

    return this.maxSecondsBetweenBlocks > 0 && elapsed >= this.maxSecondsBetweenBlocks;
  }

  async mayProposeBlock(tipArchive: Buffer, proposalBlockNumber: bigint): Promise<bigint> {
    // This checks that we can propose, and gives us the slot that we are to propose for
    try {
      const [slot, blockNumber] = await this.publisher.canProposeAtNextEthBlock(tipArchive);

      if (proposalBlockNumber !== blockNumber) {
        const msg = `Sequencer block number mismatch. Expected ${proposalBlockNumber} but got ${blockNumber}.`;
        this.log.warn(msg);
        throw new Error(msg);
      }
      return slot;
    } catch (err) {
      const msg = prettyLogViemErrorMsg(err);
      this.log.debug(
        `Rejected from being able to propose at next block with ${tipArchive.toString('hex')}: ${msg ? `${msg}` : ''}`,
      );
      throw err;
    }
  }

  doIHaveEnoughTimeLeft(proposedState: SequencerState, secondsIntoSlot: number): boolean {
    if (!this.enforceTimeTable) {
      return true;
    }

    if (this.timeTable[proposedState] === this.aztecSlotDuration) {
      return true;
    }

    const bufferSeconds = this.timeTable[proposedState] - secondsIntoSlot;

    if (bufferSeconds < 0) {
      this.log.warn(
        `Too far into slot to transition to ${proposedState}. max allowed: ${this.timeTable[proposedState]}s, time into slot: ${secondsIntoSlot}s`,
      );
      return false;
    }

    this.metrics.recordStateTransitionBufferMs(Math.floor(bufferSeconds * 1000), proposedState);

    this.log.debug(
      `Enough time to transition to ${proposedState}, max allowed: ${this.timeTable[proposedState]}s, time into slot: ${secondsIntoSlot}s`,
    );
    return true;
  }

  /**
   * Sets the sequencer state and checks if we have enough time left in the slot to transition to the new state.
   * @param proposedState - The new state to transition to.
   * @param currentSlotNumber - The current slot number.
   * @param force - Whether to force the transition even if the sequencer is stopped.
   *
   * @dev If the `currentSlotNumber` doesn't matter (e.g. transitioning to IDLE), pass in `0n`;
   * it is only used to check if we have enough time left in the slot to transition to the new state.
   */
  setState(proposedState: SequencerState, currentSlotNumber: bigint, force: boolean = false) {
    if (this.state === SequencerState.STOPPED && force !== true) {
      this.log.warn(`Cannot set sequencer from ${this.state} to ${proposedState} as it is stopped.`);
      return;
    }
    const secondsIntoSlot = getSecondsIntoSlot(this.l1GenesisTime, this.aztecSlotDuration, Number(currentSlotNumber));
    if (!this.doIHaveEnoughTimeLeft(proposedState, secondsIntoSlot)) {
      throw new SequencerTooSlowError(this.state, proposedState, this.timeTable[proposedState], secondsIntoSlot);
    }
    this.log.debug(`Transitioning from ${this.state} to ${proposedState}`);
    this.state = proposedState;
  }

  shouldProposeBlock(historicalHeader: BlockHeader | undefined, args: ShouldProposeArgs): boolean {
    if (this.isFlushing) {
      this.log.verbose(`Flushing all pending txs in new block`);
      return true;
    }

    // Compute time elapsed since the previous block
    const lastBlockTime = historicalHeader?.globalVariables.timestamp.toNumber() || 0;
    const currentTime = Math.floor(Date.now() / 1000);
    const elapsedSinceLastBlock = currentTime - lastBlockTime;
    this.log.debug(
      `Last block mined at ${lastBlockTime} current time is ${currentTime} (elapsed ${elapsedSinceLastBlock})`,
    );

    // If we haven't hit the maxSecondsBetweenBlocks, we need to have at least minTxsPerBLock txs.
    // Do not go forward with new block if not enough time has passed since last block
    if (this.minSecondsBetweenBlocks > 0 && elapsedSinceLastBlock < this.minSecondsBetweenBlocks) {
      this.log.verbose(
        `Not creating block because not enough time ${this.minSecondsBetweenBlocks} has passed since last block`,
      );
      return false;
    }

    const skipCheck = this.skipMinTxsPerBlockCheck(historicalHeader);

    // If we haven't hit the maxSecondsBetweenBlocks, we need to have at least minTxsPerBLock txs.
    if (args.pendingTxsCount != undefined) {
      if (args.pendingTxsCount < this.minTxsPerBLock) {
        if (skipCheck) {
          this.log.debug(
            `Creating block with only ${args.pendingTxsCount} txs as more than ${this.maxSecondsBetweenBlocks}s have passed since last block`,
          );
        } else {
          this.log.verbose(
            `Not creating block because not enough txs in the pool (got ${args.pendingTxsCount} min ${this.minTxsPerBLock})`,
          );
          return false;
        }
      }
    }

    // Bail if we don't have enough valid txs
    if (args.validTxsCount != undefined) {
      // Bail if we don't have enough valid txs
      if (!skipCheck && args.validTxsCount < this.minTxsPerBLock) {
        this.log.verbose(
          `Not creating block because not enough valid txs loaded from the pool (got ${args.validTxsCount} min ${this.minTxsPerBLock})`,
        );
        return false;
      }
    }

    // TODO: This check should be processedTxs.length < this.minTxsPerBLock, so we don't publish a block with
    // less txs than the minimum. But that'd cause the entire block to be aborted and retried. Instead, we should
    // go back to the p2p pool and load more txs until we hit our minTxsPerBLock target. Only if there are no txs
    // we should bail.
    if (args.processedTxsCount != undefined) {
      if (args.processedTxsCount === 0 && !skipCheck && this.minTxsPerBLock > 0) {
        this.log.verbose('No txs processed correctly to build block.');
        return false;
      }
    }

    return true;
  }

  /**
   * Build a block
   *
   * Shared between the sequencer and the validator for re-execution
   *
   * @param validTxs - The valid transactions to construct the block from
   * @param newGlobalVariables - The global variables for the new block
   * @param historicalHeader - The historical header of the parent
   * @param interrupt - The interrupt callback, used to validate the block for submission and check if we should propose the block
   */
  private async buildBlock(
    validTxs: Tx[],
    newGlobalVariables: GlobalVariables,
    historicalHeader?: BlockHeader,
    interrupt?: (processedTxs: ProcessedTx[]) => Promise<void>,
  ) {
    const blockNumber = newGlobalVariables.blockNumber.toBigInt();
    const slot = newGlobalVariables.slotNumber.toBigInt();

    this.log.debug(`Requesting L1 to L2 messages from contract for block ${blockNumber}`);
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(blockNumber);

    this.log.verbose(
      `Building block ${blockNumber} with ${validTxs.length} txs and ${l1ToL2Messages.length} messages`,
      {
        msgCount: l1ToL2Messages.length,
        txCount: validTxs.length,
        slot,
        blockNumber,
      },
    );

    const numRealTxs = validTxs.length;
    const blockSize = Math.max(2, numRealTxs);

    // Sync to the previous block at least
    await this.worldState.syncImmediate(newGlobalVariables.blockNumber.toNumber() - 1);
    this.log.debug(`Synced to previous block ${newGlobalVariables.blockNumber.toNumber() - 1}`);

    // NB: separating the dbs because both should update the state
    const publicProcessorFork = await this.worldState.fork();
    const orchestratorFork = await this.worldState.fork();

    try {
      const processor = this.publicProcessorFactory.create(publicProcessorFork, historicalHeader, newGlobalVariables);
      const blockBuildingTimer = new Timer();
      const blockBuilder = this.blockBuilderFactory.create(orchestratorFork);
      await blockBuilder.startNewBlock(newGlobalVariables, l1ToL2Messages);

      const [publicProcessorDuration, [processedTxs, failedTxs]] = await elapsed(() =>
        processor.process(validTxs, blockSize, this.txValidatorFactory.validatorForProcessedTxs(publicProcessorFork)),
      );
      if (failedTxs.length > 0) {
        const failedTxData = failedTxs.map(fail => fail.tx);
        this.log.verbose(`Dropping failed txs ${Tx.getHashes(failedTxData).join(', ')}`);
        await this.p2pClient.deleteTxs(Tx.getHashes(failedTxData));
      }
      await blockBuilder.addTxs(processedTxs);

      await interrupt?.(processedTxs);

      // All real transactions have been added, set the block as full and complete the proving.
      const block = await blockBuilder.setBlockCompleted();

      return {
        block,
        publicProcessorDuration,
        numMsgs: l1ToL2Messages.length,
        numProcessedTxs: processedTxs.length,
        blockBuildingTimer,
      };
    } finally {
      // We create a fresh processor each time to reset any cached state (eg storage writes)
      await publicProcessorFork.close();
      await orchestratorFork.close();
    }
  }

  /**
   * @notice  Build and propose a block to the chain
   *
   * @dev     MUST throw instead of exiting early to ensure that world-state
   *          is being rolled back if the block is dropped.
   *
   * @param validTxs - The valid transactions to construct the block from
   * @param proposalHeader - The partial header constructed for the proposal
   * @param historicalHeader - The historical header of the parent
   */
  @trackSpan('Sequencer.buildBlockAndAttemptToPublish', (_validTxs, proposalHeader, _historicalHeader) => ({
    [Attributes.BLOCK_NUMBER]: proposalHeader.globalVariables.blockNumber.toNumber(),
  }))
  private async buildBlockAndAttemptToPublish(
    validTxs: Tx[],
    proposalHeader: BlockHeader,
    historicalHeader: BlockHeader | undefined,
  ): Promise<void> {
    await this.publisher.validateBlockForSubmission(proposalHeader);

    const newGlobalVariables = proposalHeader.globalVariables;
    const blockNumber = newGlobalVariables.blockNumber.toNumber();
    const slot = newGlobalVariables.slotNumber.toBigInt();

    this.metrics.recordNewBlock(blockNumber, validTxs.length);
    const workTimer = new Timer();
    this.setState(SequencerState.CREATING_BLOCK, slot);

    /**
     * BuildBlock is shared between the sequencer and the validator for re-execution
     * We use the interrupt callback to validate the block for submission and check if we should propose the block
     *
     * If we fail, we throw an error in order to roll back
     */
    const interrupt = async (processedTxs: ProcessedTx[]) => {
      await this.publisher.validateBlockForSubmission(proposalHeader);

      if (
        !this.shouldProposeBlock(historicalHeader, {
          validTxsCount: validTxs.length,
          processedTxsCount: processedTxs.length,
        })
      ) {
        // TODO: Roll back changes to world state
        throw new Error('Should not propose the block');
      }
    };

    try {
      const buildBlockRes = await this.buildBlock(validTxs, newGlobalVariables, historicalHeader, interrupt);
      const { block, publicProcessorDuration, numProcessedTxs, numMsgs, blockBuildingTimer } = buildBlockRes;

      // TODO(@PhilWindle) We should probably periodically check for things like another
      // block being published before ours instead of just waiting on our block

      await this.publisher.validateBlockForSubmission(block.header);

      const workDuration = workTimer.ms();
      const blockStats: L2BlockBuiltStats = {
        eventName: 'l2-block-built',
        creator: this.publisher.getSenderAddress().toString(),
        duration: workDuration,
        publicProcessDuration: publicProcessorDuration,
        rollupCircuitsDuration: blockBuildingTimer.ms(),
        ...block.getStats(),
      };

      const blockHash = block.hash();
      const txHashes = validTxs.map(tx => tx.getTxHash());
      this.log.info(`Built block ${block.number} with hash ${blockHash}`, {
        blockHash,
        globalVariables: block.header.globalVariables.toInspect(),
        txHashes,
        ...blockStats,
      });

      if (this.isFlushing) {
        this.log.verbose(`Sequencer flushing completed`);
      }

      this.isFlushing = false;
      this.log.debug('Collecting attestations');
      const stopCollectingAttestationsTimer = this.metrics.startCollectingAttestationsTimer();
      const attestations = await this.collectAttestations(block, txHashes);
      if (attestations !== undefined) {
        this.log.verbose(`Collected ${attestations.length} attestations`);
      }
      stopCollectingAttestationsTimer();

      this.log.debug('Collecting proof quotes');
      const proofQuote = await this.createProofClaimForPreviousEpoch(newGlobalVariables.slotNumber.toBigInt());

      await this.publishL2Block(block, attestations, txHashes, proofQuote);
      this.metrics.recordPublishedBlock(workDuration);
      this.log.info(
        `Published rollup block ${
          block.number
        } with ${numProcessedTxs} transactions and ${numMsgs} messages in ${Math.ceil(workDuration)}ms`,
        {
          blockNumber: block.number,
          blockHash: blockHash,
          slot,
          txCount: numProcessedTxs,
          msgCount: numMsgs,
          duration: Math.ceil(workDuration),
          submitter: this.publisher.getSenderAddress().toString(),
        },
      );
    } catch (err) {
      this.metrics.recordFailedBlock();
      throw err;
    }
  }

  /** Forces the sequencer to bypass all time and tx count checks for the next block and build anyway. */
  public flush() {
    this.isFlushing = true;
  }

  @trackSpan('Sequencer.collectAttestations', (block, txHashes) => ({
    [Attributes.BLOCK_NUMBER]: block.number,
    [Attributes.BLOCK_ARCHIVE]: block.archive.toString(),
    [Attributes.BLOCK_TXS_COUNT]: txHashes.length,
  }))
  protected async collectAttestations(block: L2Block, txHashes: TxHash[]): Promise<Signature[] | undefined> {
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7962): inefficient to have a round trip in here - this should be cached
    const committee = await this.publisher.getCurrentEpochCommittee();

    if (committee.length === 0) {
      this.log.verbose(`Attesting committee is empty`);
      return undefined;
    } else {
      this.log.debug(`Attesting committee length is ${committee.length}`);
    }

    if (!this.validatorClient) {
      const msg = 'Missing validator client: Cannot collect attestations';
      this.log.error(msg);
      throw new Error(msg);
    }

    const numberOfRequiredAttestations = Math.floor((committee.length * 2) / 3) + 1;

    this.log.debug('Creating block proposal');
    const proposal = await this.validatorClient.createBlockProposal(block.header, block.archive.root, txHashes);
    if (!proposal) {
      this.log.warn(`Failed to create block proposal, skipping collecting attestations`);
      return undefined;
    }

    const slotNumber = block.header.globalVariables.slotNumber.toBigInt();

    this.setState(SequencerState.PUBLISHING_BLOCK_TO_PEERS, slotNumber);
    this.log.debug('Broadcasting block proposal to validators');
    this.validatorClient.broadcastBlockProposal(proposal);

    this.setState(SequencerState.WAITING_FOR_ATTESTATIONS, slotNumber);
    const attestations = await this.validatorClient.collectAttestations(proposal, numberOfRequiredAttestations);

    // note: the smart contract requires that the signatures are provided in the order of the committee
    return orderAttestations(attestations, committee);
  }

  protected async createProofClaimForPreviousEpoch(slotNumber: bigint): Promise<EpochProofQuote | undefined> {
    try {
      // Find out which epoch we are currently in
      const epochToProve = await this.publisher.getClaimableEpoch();
      if (epochToProve === undefined) {
        this.log.debug(`No epoch to prove`);
        return undefined;
      }

      // Get quotes for the epoch to be proven
      const quotes = await this.p2pClient.getEpochProofQuotes(epochToProve);
      this.log.verbose(`Retrieved ${quotes.length} quotes for slot ${slotNumber} epoch ${epochToProve}`, {
        epochToProve,
        slotNumber,
        quotes: quotes.map(q => q.payload),
      });
      // ensure these quotes are still valid for the slot and have the contract validate them
      const validQuotesPromise = Promise.all(
        quotes.filter(x => x.payload.validUntilSlot >= slotNumber).map(x => this.publisher.validateProofQuote(x)),
      );

      const validQuotes = (await validQuotesPromise).filter((q): q is EpochProofQuote => !!q);
      if (!validQuotes.length) {
        this.log.warn(`Failed to find any valid proof quotes`);
        return undefined;
      }
      // pick the quote with the lowest fee
      const sortedQuotes = validQuotes.sort(
        (a: EpochProofQuote, b: EpochProofQuote) => a.payload.basisPointFee - b.payload.basisPointFee,
      );
      const quote = sortedQuotes[0];
      this.log.info(`Selected proof quote for proof claim`, quote.payload);
      return quote;
    } catch (err) {
      this.log.error(`Failed to create proof claim for previous epoch`, err, { slotNumber });
      return undefined;
    }
  }

  /**
   * Publishes the L2Block to the rollup contract.
   * @param block - The L2Block to be published.
   */
  @trackSpan('Sequencer.publishL2Block', block => ({
    [Attributes.BLOCK_NUMBER]: block.number,
  }))
  protected async publishL2Block(
    block: L2Block,
    attestations?: Signature[],
    txHashes?: TxHash[],
    proofQuote?: EpochProofQuote,
  ) {
    // Publishes new block to the network and awaits the tx to be mined
    this.setState(SequencerState.PUBLISHING_BLOCK, block.header.globalVariables.slotNumber.toBigInt());

    const publishedL2Block = await this.publisher.proposeL2Block(block, attestations, txHashes, proofQuote);
    if (!publishedL2Block) {
      throw new Error(`Failed to publish block ${block.number}`);
    }
  }

  protected async takeValidTxs<T extends Tx | ProcessedTx>(txs: T[], validator: TxValidator<T>): Promise<T[]> {
    const [valid, invalid] = await validator.validateTxs(txs);
    if (invalid.length > 0) {
      this.log.debug(`Dropping invalid txs from the p2p pool ${Tx.getHashes(invalid).join(', ')}`);
      await this.p2pClient.deleteTxs(Tx.getHashes(invalid));
    }

    return valid.slice(0, this.maxTxsPerBlock);
  }

  protected takeTxsWithinMaxSize(txs: Tx[]): Tx[] {
    const maxSize = this.maxBlockSizeInBytes;
    let totalSize = 0;

    const toReturn: Tx[] = [];
    for (const tx of txs) {
      const txSize = tx.getSize() - tx.clientIvcProof.clientIvcProofBuffer.length;
      if (totalSize + txSize > maxSize) {
        this.log.debug(
          `Dropping tx ${tx.getTxHash()} with estimated size ${txSize} due to exceeding ${maxSize} block size limit (currently at ${totalSize})`,
        );
        continue;
      }
      toReturn.push(tx);
      totalSize += txSize;
    }

    return toReturn;
  }

  /**
   * Returns whether all dependencies have caught up.
   * We don't check against the previous block submitted since it may have been reorg'd out.
   * @returns Boolean indicating if our dependencies are synced to the latest block.
   */
  protected async isBlockSynced() {
    const syncedBlocks = await Promise.all([
      this.worldState.status().then((s: WorldStateSynchronizerStatus) => s.syncedToL2Block),
      this.l2BlockSource.getL2Tips().then(t => t.latest),
      this.p2pClient.getStatus().then(s => s.syncedToL2Block.number),
      this.l1ToL2MessageSource.getBlockNumber(),
    ] as const);
    const [worldState, l2BlockSource, p2p, l1ToL2MessageSource] = syncedBlocks;
    const result =
      // check that world state has caught up with archiver
      // note that the archiver reports undefined hash for the genesis block
      // because it doesn't have access to world state to compute it (facepalm)
      (l2BlockSource.hash === undefined || worldState.hash === l2BlockSource.hash) &&
      // and p2p client and message source are at least at the same block
      // this should change to hashes once p2p client handles reorgs
      // and once we stop pretending that the l1tol2message source is not
      // just the archiver under a different name
      p2p >= l2BlockSource.number &&
      l1ToL2MessageSource >= l2BlockSource.number;

    this.log.debug(`Sequencer sync check ${result ? 'succeeded' : 'failed'}`, {
      worldStateNumber: worldState.number,
      worldStateHash: worldState.hash,
      l2BlockSourceNumber: l2BlockSource.number,
      l2BlockSourceHash: l2BlockSource.hash,
      p2pNumber: p2p,
      l1ToL2MessageSourceNumber: l1ToL2MessageSource,
    });
    return result;
  }

  get coinbase(): EthAddress {
    return this._coinbase;
  }

  get feeRecipient(): AztecAddress {
    return this._feeRecipient;
  }
}

/**
 * State of the sequencer.
 */
