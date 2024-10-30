import {
  type BlockAttestation,
  type EpochProofQuote,
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockSource,
  type ProcessedTx,
  Tx,
  type TxHash,
  type TxValidator,
  type WorldStateSynchronizer,
} from '@aztec/circuit-types';
import {
  type AllowedElement,
  BlockProofError,
  type WorldStateSynchronizerStatus,
} from '@aztec/circuit-types/interfaces';
import { type L2BlockBuiltStats } from '@aztec/circuit-types/stats';
import {
  AppendOnlyTreeSnapshot,
  ContentCommitment,
  GENESIS_ARCHIVE_ROOT,
  Header,
  StateReference,
} from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { Timer, elapsed } from '@aztec/foundation/timer';
import { type P2P } from '@aztec/p2p';
import { type PublicProcessorFactory } from '@aztec/simulator';
import { Attributes, type TelemetryClient, type Tracer, trackSpan } from '@aztec/telemetry-client';
import { type ValidatorClient } from '@aztec/validator-client';

import { inspect } from 'util';

import { type BlockBuilderFactory } from '../block_builder/index.js';
import { type GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import { type L1Publisher } from '../publisher/l1-publisher.js';
import { prettyLogViemErrorMsg } from '../publisher/utils.js';
import { type TxValidatorFactory } from '../tx_validator/tx_validator_factory.js';
import { type SequencerConfig } from './config.js';
import { SequencerMetrics } from './metrics.js';

export type ShouldProposeArgs = {
  pendingTxsCount?: number;
  validTxsCount?: number;
  processedTxsCount?: number;
};

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
  private allowedInTeardown: AllowedElement[] = [];
  private maxBlockSizeInBytes: number = 1024 * 1024;
  private metrics: SequencerMetrics;
  private isFlushing: boolean = false;

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
    telemetry: TelemetryClient,
    private config: SequencerConfig = {},
    private log = createDebugLogger('aztec:sequencer'),
  ) {
    this.updateConfig(config);
    this.metrics = new SequencerMetrics(telemetry, () => this.state, 'Sequencer');
    this.log.verbose(`Initialized sequencer with ${this.minTxsPerBLock}-${this.maxTxsPerBlock} txs per block.`);
  }

  get tracer(): Tracer {
    return this.metrics.tracer;
  }

  /**
   * Updates sequencer config.
   * @param config - New parameters.
   */
  public updateConfig(config: SequencerConfig) {
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
    // TODO(#5917) remove this. it is no longer needed since we don't need to whitelist functions in teardown
    if (config.allowedInTeardown) {
      this.allowedInTeardown = config.allowedInTeardown;
    }
    if (config.gerousiaPayload) {
      this.publisher.setPayload(config.gerousiaPayload);
    }

    // TODO: Just read everything from the config object as needed instead of copying everything into local vars.
    this.config = config;
  }

  /**
   * Starts the sequencer and moves to IDLE state. Blocks until the initial sync is complete.
   */
  public start() {
    this.runningPromise = new RunningPromise(this.work.bind(this), this.pollingIntervalMs);
    this.runningPromise.start();
    this.state = SequencerState.IDLE;
    this.log.info('Sequencer started');
    return Promise.resolve();
  }

  /**
   * Stops the sequencer from processing txs and moves to STOPPED state.
   */
  public async stop(): Promise<void> {
    this.log.debug(`Stopping sequencer`);
    await this.runningPromise?.stop();
    this.publisher.interrupt();
    this.state = SequencerState.STOPPED;
    this.log.info('Stopped sequencer');
  }

  /**
   * Starts a previously stopped sequencer.
   */
  public restart() {
    this.log.info('Restarting sequencer');
    this.publisher.restart();
    this.runningPromise!.start();
    this.state = SequencerState.IDLE;
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
  protected async work() {
    // Update state when the previous block has been synced
    const prevBlockSynced = await this.isBlockSynced();
    // Do not go forward with new block if the previous one has not been mined and processed
    if (!prevBlockSynced) {
      this.log.debug('Previous block has not been mined and processed yet');
      return;
    }

    if (prevBlockSynced && this.state === SequencerState.PUBLISHING_BLOCK) {
      this.log.debug(`Block has been synced`);
      this.state = SequencerState.IDLE;
    }

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

    this.state = SequencerState.WAITING_FOR_TXS;

    // Get txs to build the new block.
    const pendingTxs = this.p2pClient.getTxs('pending');

    if (!this.shouldProposeBlock(historicalHeader, { pendingTxsCount: pendingTxs.length })) {
      return;
    }
    this.log.debug(`Retrieved ${pendingTxs.length} txs from P2P pool`);

    // If I created a "partial" header here that should make our job much easier.
    const proposalHeader = new Header(
      new AppendOnlyTreeSnapshot(Fr.fromBuffer(chainTipArchive), 1),
      ContentCommitment.empty(),
      StateReference.empty(),
      newGlobalVariables,
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
      if (BlockProofError.isBlockProofError(err)) {
        const txHashes = err.txHashes.filter(h => !h.isZero());
        this.log.warn(`Proving block failed, removing ${txHashes.length} txs from pool`);
        await this.p2pClient.deleteTxs(txHashes);
      }
      this.log.error(`Error assembling block`, (err as any).stack);
    }
  }

  /** Whether to skip the check of min txs per block if more than maxSecondsBetweenBlocks has passed since the previous block. */
  private skipMinTxsPerBlockCheck(historicalHeader: Header | undefined): boolean {
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
        const msg = `Block number mismatch. Expected ${proposalBlockNumber} but got ${blockNumber}`;
        this.log.debug(msg);
        throw new Error(msg);
      }

      this.log.debug(`Can propose block ${proposalBlockNumber} at slot ${slot}`);
      return slot;
    } catch (err) {
      const msg = prettyLogViemErrorMsg(err);
      this.log.verbose(
        `Rejected from being able to propose at next block with ${tipArchive.toString('hex')}: ${msg ? `${msg}` : ''}`,
      );
      throw err;
    }
  }

  shouldProposeBlock(historicalHeader: Header | undefined, args: ShouldProposeArgs): boolean {
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
      this.log.debug(
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
          this.log.debug(
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
        this.log.debug(
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
        this.log.verbose('No txs processed correctly to build block. Exiting');
        return false;
      }
    }

    return true;
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
    proposalHeader: Header,
    historicalHeader: Header | undefined,
  ): Promise<void> {
    await this.publisher.validateBlockForSubmission(proposalHeader);

    const newGlobalVariables = proposalHeader.globalVariables;

    this.metrics.recordNewBlock(newGlobalVariables.blockNumber.toNumber(), validTxs.length);
    const workTimer = new Timer();
    this.state = SequencerState.CREATING_BLOCK;
    this.log.info(
      `Building blockNumber=${newGlobalVariables.blockNumber.toNumber()} txCount=${
        validTxs.length
      } slotNumber=${newGlobalVariables.slotNumber.toNumber()}`,
    );

    // Get l1 to l2 messages from the contract
    this.log.debug('Requesting L1 to L2 messages from contract');
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(newGlobalVariables.blockNumber.toBigInt());
    this.log.verbose(
      `Retrieved ${l1ToL2Messages.length} L1 to L2 messages for block ${newGlobalVariables.blockNumber.toNumber()}`,
    );

    const numRealTxs = validTxs.length;
    const blockSize = Math.max(2, numRealTxs);

    const fork = await this.worldState.fork();
    try {
      // We create a fresh processor each time to reset any cached state (eg storage writes)
      const processor = this.publicProcessorFactory.create(fork, historicalHeader, newGlobalVariables);
      const blockBuildingTimer = new Timer();
      const blockBuilder = this.blockBuilderFactory.create(fork);
      await blockBuilder.startNewBlock(blockSize, newGlobalVariables, l1ToL2Messages);

      const [publicProcessorDuration, [processedTxs, failedTxs]] = await elapsed(() =>
        processor.process(validTxs, blockSize, blockBuilder, this.txValidatorFactory.validatorForProcessedTxs(fork)),
      );
      if (failedTxs.length > 0) {
        const failedTxData = failedTxs.map(fail => fail.tx);
        this.log.debug(`Dropping failed txs ${Tx.getHashes(failedTxData).join(', ')}`);
        await this.p2pClient.deleteTxs(Tx.getHashes(failedTxData));
      }

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

      // All real transactions have been added, set the block as full and complete the proving.
      const block = await blockBuilder.setBlockCompleted();

      // TODO(@PhilWindle) We should probably periodically check for things like another
      // block being published before ours instead of just waiting on our block

      await this.publisher.validateBlockForSubmission(block.header);

      const workDuration = workTimer.ms();
      this.log.verbose(
        `Assembled block ${block.number} (txEffectsHash: ${block.header.contentCommitment.txsEffectsHash.toString(
          'hex',
        )})`,
        {
          eventName: 'l2-block-built',
          creator: this.publisher.getSenderAddress().toString(),
          duration: workDuration,
          publicProcessDuration: publicProcessorDuration,
          rollupCircuitsDuration: blockBuildingTimer.ms(),
          ...block.getStats(),
        } satisfies L2BlockBuiltStats,
      );

      if (this.isFlushing) {
        this.log.verbose(`Flushing completed`);
      }

      const txHashes = validTxs.map(tx => tx.getTxHash());

      this.isFlushing = false;
      this.log.verbose('Collecting attestations');
      const attestations = await this.collectAttestations(block, txHashes);
      this.log.verbose('Attestations collected');

      this.log.verbose('Collecting proof quotes');
      const proofQuote = await this.createProofClaimForPreviousEpoch(newGlobalVariables.slotNumber.toBigInt());
      this.log.verbose(proofQuote ? `Using proof quote ${inspect(proofQuote.payload)}` : 'No proof quote available');

      try {
        await this.publishL2Block(block, attestations, txHashes, proofQuote);
        this.metrics.recordPublishedBlock(workDuration);
        this.log.info(
          `Submitted rollup block ${block.number} with ${processedTxs.length} transactions duration=${Math.ceil(
            workDuration,
          )}ms (Submitter: ${this.publisher.getSenderAddress()})`,
        );
      } catch (err) {
        this.metrics.recordFailedBlock();
        throw err;
      }
    } finally {
      await fork.close();
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
    this.log.debug(`Attesting committee length ${committee.length}`);

    if (committee.length === 0) {
      this.log.debug(`Attesting committee length is 0, skipping`);
      return undefined;
    }

    if (!this.validatorClient) {
      const msg = 'Missing validator client: Cannot collect attestations';
      this.log.error(msg);
      throw new Error(msg);
    }

    const numberOfRequiredAttestations = Math.floor((committee.length * 2) / 3) + 1;

    this.log.verbose('Creating block proposal');
    const proposal = await this.validatorClient.createBlockProposal(block.header, block.archive.root, txHashes);

    this.state = SequencerState.PUBLISHING_BLOCK_TO_PEERS;
    this.log.verbose('Broadcasting block proposal to validators');
    this.validatorClient.broadcastBlockProposal(proposal);

    this.state = SequencerState.WAITING_FOR_ATTESTATIONS;
    const attestations = await this.validatorClient.collectAttestations(proposal, numberOfRequiredAttestations);
    this.log.verbose(`Collected attestations from validators, number of attestations: ${attestations.length}`);

    // note: the smart contract requires that the signatures are provided in the order of the committee
    return orderAttestations(attestations, committee);
  }

  protected async createProofClaimForPreviousEpoch(slotNumber: bigint): Promise<EpochProofQuote | undefined> {
    try {
      // Find out which epoch we are currently in
      const epochToProve = await this.publisher.getClaimableEpoch();
      if (epochToProve === undefined) {
        this.log.verbose(`No epoch to prove`);
        return undefined;
      }

      // Get quotes for the epoch to be proven
      const quotes = await this.p2pClient.getEpochProofQuotes(epochToProve);
      this.log.verbose(`Retrieved ${quotes.length} quotes, slot: ${slotNumber}, epoch to prove: ${epochToProve}`);
      for (const quote of quotes) {
        this.log.verbose(inspect(quote.payload));
      }
      // ensure these quotes are still valid for the slot and have the contract validate them
      const validQuotesPromise = Promise.all(
        quotes.filter(x => x.payload.validUntilSlot >= slotNumber).map(x => this.publisher.validateProofQuote(x)),
      );

      const validQuotes = (await validQuotesPromise).filter((q): q is EpochProofQuote => !!q);
      if (!validQuotes.length) {
        this.log.verbose(`Failed to find any valid proof quotes`);
        return undefined;
      }
      // pick the quote with the lowest fee
      const sortedQuotes = validQuotes.sort(
        (a: EpochProofQuote, b: EpochProofQuote) => a.payload.basisPointFee - b.payload.basisPointFee,
      );
      return sortedQuotes[0];
    } catch (err) {
      this.log.error(`Failed to create proof claim for previous epoch: ${err}`);
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
    this.state = SequencerState.PUBLISHING_BLOCK;

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
        this.log.warn(
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

    this.log.verbose(`Sequencer sync check ${result ? 'succeeded' : 'failed'}`, {
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
export enum SequencerState {
  /**
   * Will move to WAITING_FOR_TXS after a configured amount of time.
   */
  IDLE,
  /**
   * Polling the P2P module for txs to include in a block. Will move to CREATING_BLOCK if there are valid txs to include, or back to IDLE otherwise.
   */
  WAITING_FOR_TXS,
  /**
   * Creating a new L2 block. Includes processing public function calls and running rollup circuits. Will move to PUBLISHING_CONTRACT_DATA.
   */
  CREATING_BLOCK,
  /**
   * Publishing blocks to validator peers. Will move to WAITING_FOR_ATTESTATIONS.
   */
  PUBLISHING_BLOCK_TO_PEERS,
  /**
   * The block has been published to peers, and we are waiting for attestations. Will move to PUBLISHING_CONTRACT_DATA.
   */
  WAITING_FOR_ATTESTATIONS,
  /**
   * Sending the tx to L1 with encrypted logs and awaiting it to be mined. Will move back to PUBLISHING_BLOCK once finished.
   */
  PUBLISHING_CONTRACT_DATA,
  /**
   * Sending the tx to L1 with the L2 block data and awaiting it to be mined. Will move to IDLE.
   */
  PUBLISHING_BLOCK,
  /**
   * Sequencer is stopped and not processing any txs from the pool.
   */
  STOPPED,
}

/** Order Attestations
 *
 * Returns attestation signatures in the order of a series of provided ethereum addresses
 * The rollup smart contract expects attestations to appear in the order of the committee
 *
 * @todo: perform this logic within the memory attestation store instead?
 */
function orderAttestations(attestations: BlockAttestation[], orderAddresses: EthAddress[]): Signature[] {
  // Create a map of sender addresses to BlockAttestations
  const attestationMap = new Map<string, BlockAttestation>();

  for (const attestation of attestations) {
    const sender = attestation.getSender();
    if (sender) {
      attestationMap.set(sender.toString(), attestation);
    }
  }

  // Create the ordered array based on the orderAddresses, else return an empty signature
  const orderedAttestations = orderAddresses.map(address => {
    const addressString = address.toString();
    return attestationMap.get(addressString)?.signature || Signature.empty();
  });

  return orderedAttestations;
}
