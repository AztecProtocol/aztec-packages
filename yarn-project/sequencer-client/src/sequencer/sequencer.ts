import type { L2Block } from '@aztec/aztec.js';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import { FormattedViemError, NoCommitteeError, type ViemPublicClient } from '@aztec/ethereum';
import { Buffer32 } from '@aztec/foundation/buffer';
import { omit } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { type DateProvider, Timer } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { P2P } from '@aztec/p2p';
import type { SlasherClient } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CommitteeAttestation, L2BlockSource } from '@aztec/stdlib/block';
import { type L1RollupConstants, getSlotAtTimestamp } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import {
  type IFullNodeBlockBuilder,
  type PublicProcessorLimits,
  SequencerConfigSchema,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { BlockProposalOptions } from '@aztec/stdlib/p2p';
import { pickFromSchema } from '@aztec/stdlib/schemas';
import type { L2BlockBuiltStats } from '@aztec/stdlib/stats';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import {
  ContentCommitment,
  type FailedTx,
  GlobalVariables,
  ProposedBlockHeader,
  Tx,
  type TxHash,
} from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';
import {
  Attributes,
  L1Metrics,
  type TelemetryClient,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';
import type { ValidatorClient } from '@aztec/validator-client';

import EventEmitter from 'node:events';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import { type Action, type SequencerPublisher, VoteType } from '../publisher/sequencer-publisher.js';
import type { SequencerConfig } from './config.js';
import { SequencerMetrics } from './metrics.js';
import { SequencerTimetable, SequencerTooSlowError } from './timetable.js';
import { SequencerState, type SequencerStateWithSlot, orderAttestations } from './utils.js';

export { SequencerState };

type SequencerRollupConstants = Pick<L1RollupConstants, 'ethereumSlotDuration' | 'l1GenesisTime' | 'slotDuration'>;

export type SequencerEvents = {
  ['state-changed']: (args: {
    oldState: SequencerState;
    newState: SequencerState;
    secondsIntoSlot?: number;
    slotNumber?: bigint;
  }) => void;
  ['proposer-rollup-check-failed']: (args: { reason: string }) => void;
  ['tx-count-check-failed']: (args: { minTxs: number; availableTxs: number }) => void;
  ['block-build-failed']: (args: { reason: string }) => void;
  ['block-publish-failed']: (args: { validActions?: Action[]; expiredActions?: Action[] }) => void;
  ['block-published']: (args: { blockNumber: number; slot: number }) => void;
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
export class Sequencer extends (EventEmitter as new () => TypedEventEmitter<SequencerEvents>) {
  private runningPromise?: RunningPromise;
  private pollingIntervalMs: number = 1000;
  private maxTxsPerBlock = 32;
  private minTxsPerBlock = 1;
  private maxL1TxInclusionTimeIntoSlot = 0;
  // TODO: zero values should not be allowed for the following 2 values in PROD
  private _coinbase = EthAddress.ZERO;
  private _feeRecipient = AztecAddress.ZERO;
  private state = SequencerState.STOPPED;
  private maxBlockSizeInBytes: number = 1024 * 1024;
  private maxBlockGas: Gas = new Gas(100e9, 100e9);
  private metrics: SequencerMetrics;
  private l1Metrics: L1Metrics;
  private lastBlockPublished: L2Block | undefined;
  private isFlushing: boolean = false;

  /** The maximum number of seconds that the sequencer can be into a slot to transition to a particular state. */
  protected timetable!: SequencerTimetable;
  protected enforceTimeTable: boolean = false;

  constructor(
    protected publisher: SequencerPublisher,
    protected validatorClient: ValidatorClient | undefined, // During migration the validator client can be inactive
    protected globalsBuilder: GlobalVariableBuilder,
    protected p2pClient: P2P,
    protected worldState: WorldStateSynchronizer,
    protected slasherClient: SlasherClient,
    protected l2BlockSource: L2BlockSource,
    protected l1ToL2MessageSource: L1ToL2MessageSource,
    protected blockBuilder: IFullNodeBlockBuilder,
    protected l1Constants: SequencerRollupConstants,
    protected dateProvider: DateProvider,
    protected config: SequencerConfig = {},
    protected telemetry: TelemetryClient = getTelemetryClient(),
    protected log = createLogger('sequencer'),
  ) {
    super();

    this.metrics = new SequencerMetrics(
      telemetry,
      () => this.state,
      this.config.coinbase ?? this.publisher.getSenderAddress(),
      this.publisher.getRollupContract(),
      'Sequencer',
    );
    this.l1Metrics = new L1Metrics(
      telemetry.getMeter('SequencerL1Metrics'),
      publisher.l1TxUtils.client as unknown as ViemPublicClient,
      [publisher.getSenderAddress()],
    );

    // Register the slasher on the publisher to fetch slashing payloads
    this.publisher.registerSlashPayloadGetter(this.slasherClient.getSlashPayload.bind(this.slasherClient));
  }

  get tracer(): Tracer {
    return this.metrics.tracer;
  }

  public getValidatorAddresses() {
    return this.validatorClient?.getValidatorAddresses();
  }

  /**
   * Updates sequencer config by the defined values in the config on input.
   * @param config - New parameters.
   */
  public updateConfig(config: SequencerConfig) {
    this.log.info(
      `Sequencer config set`,
      omit(pickFromSchema(config, SequencerConfigSchema), 'txPublicSetupAllowList'),
    );

    if (config.transactionPollingIntervalMS !== undefined) {
      this.pollingIntervalMs = config.transactionPollingIntervalMS;
    }
    if (config.maxTxsPerBlock !== undefined) {
      this.maxTxsPerBlock = config.maxTxsPerBlock;
    }
    if (config.minTxsPerBlock !== undefined) {
      this.minTxsPerBlock = config.minTxsPerBlock;
    }
    if (config.maxDABlockGas !== undefined) {
      this.maxBlockGas = new Gas(config.maxDABlockGas, this.maxBlockGas.l2Gas);
    }
    if (config.maxL2BlockGas !== undefined) {
      this.maxBlockGas = new Gas(this.maxBlockGas.daGas, config.maxL2BlockGas);
    }
    if (config.coinbase) {
      this._coinbase = config.coinbase;
      this.metrics.setCoinbase(this._coinbase);
    }
    if (config.feeRecipient) {
      this._feeRecipient = config.feeRecipient;
    }
    if (config.maxBlockSizeInBytes !== undefined) {
      this.maxBlockSizeInBytes = config.maxBlockSizeInBytes;
    }
    if (config.governanceProposerPayload) {
      this.publisher.setGovernancePayload(config.governanceProposerPayload);
    }
    if (config.maxL1TxInclusionTimeIntoSlot !== undefined) {
      this.maxL1TxInclusionTimeIntoSlot = config.maxL1TxInclusionTimeIntoSlot;
    }
    if (config.enforceTimeTable !== undefined) {
      this.enforceTimeTable = config.enforceTimeTable;
    }

    this.setTimeTable();

    // TODO: Just read everything from the config object as needed instead of copying everything into local vars.

    // Update all values on this.config that are populated in the config object.
    Object.assign(this.config, config);
  }

  private setTimeTable() {
    this.timetable = new SequencerTimetable(
      {
        ethereumSlotDuration: this.l1Constants.ethereumSlotDuration,
        aztecSlotDuration: this.aztecSlotDuration,
        maxL1TxInclusionTimeIntoSlot: this.maxL1TxInclusionTimeIntoSlot,
        attestationPropagationTime: this.config.attestationPropagationTime,
        enforce: this.enforceTimeTable,
      },
      this.metrics,
      this.log,
    );
  }

  /**
   * Starts the sequencer and moves to IDLE state.
   */
  public start() {
    this.updateConfig(this.config);
    this.metrics.start();
    this.runningPromise = new RunningPromise(this.work.bind(this), this.log, this.pollingIntervalMs);
    this.setState(SequencerState.IDLE, undefined, { force: true });
    this.runningPromise.start();
    this.l1Metrics.start();
    this.log.info(`Sequencer started with address ${this.publisher.getSenderAddress().toString()}`);
  }

  /**
   * Stops the sequencer from processing txs and moves to STOPPED state.
   */
  public async stop(): Promise<void> {
    this.log.debug(`Stopping sequencer`);
    this.metrics.stop();
    await this.validatorClient?.stop();
    await this.runningPromise?.stop();
    this.publisher.interrupt();
    this.setState(SequencerState.STOPPED, undefined, { force: true });
    this.l1Metrics.stop();
    this.log.info('Stopped sequencer');
  }

  /**
   * Starts a previously stopped sequencer.
   */
  public resume() {
    this.log.info('Restarting sequencer');
    this.publisher.restart();
    this.runningPromise!.start();
    this.setState(SequencerState.IDLE, undefined, { force: true });
  }

  /**
   * Returns the current state of the sequencer.
   * @returns An object with a state entry with one of SequencerState.
   */
  public status() {
    return { state: this.state };
  }

  /** Forces the sequencer to bypass all time and tx count checks for the next block and build anyway. */
  public flush() {
    this.isFlushing = true;
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
    this.setState(SequencerState.SYNCHRONIZING, undefined);

    // Check all components are synced to latest as seen by the archiver
    const syncedTo = await this.getChainTip();

    // Do not go forward with new block if the previous one has not been mined and processed
    if (!syncedTo) {
      return;
    }

    this.setState(SequencerState.PROPOSER_CHECK, undefined);

    const chainTipArchive = syncedTo.archive;
    const newBlockNumber = syncedTo.blockNumber + 1;

    const { slot, ts, now } = this.publisher.epochCache.getEpochAndSlotInNextL1Slot();
    this.metrics.observeSlotChange(slot, this.publisher.getSenderAddress().toString());

    // Check that the archiver and dependencies have synced to the previous L1 slot at least
    // TODO(#14766): Archiver reports L1 timestamp based on L1 blocks seen, which means that a missed L1 block will
    // cause the archiver L1 timestamp to fall behind, and cause this sequencer to start processing one L1 slot later.
    const syncLogData = {
      now,
      syncedToL1Ts: syncedTo.l1Timestamp,
      syncedToL2Slot: getSlotAtTimestamp(syncedTo.l1Timestamp, this.l1Constants),
      nextL2Slot: slot,
      nextL2SlotTs: ts,
      l1SlotDuration: this.l1Constants.ethereumSlotDuration,
    };

    if (syncedTo.l1Timestamp + BigInt(this.l1Constants.ethereumSlotDuration) < ts) {
      this.log.debug(
        `Cannot propose block ${newBlockNumber} at next L2 slot ${slot} due to pending sync from L1`,
        syncLogData,
      );
      return;
    }

    // Check that the slot is not taken by a block already
    if (syncedTo.block && syncedTo.block.header.getSlot() >= slot) {
      this.log.debug(
        `Cannot propose block at next L2 slot ${slot} since that slot was taken by block ${syncedTo.blockNumber}`,
        { ...syncLogData, block: syncedTo.block.header.toInspect() },
      );
      return;
    }

    // Or that we haven't published it ourselves
    if (this.lastBlockPublished && this.lastBlockPublished.header.getSlot() >= slot) {
      this.log.debug(
        `Cannot propose block at next L2 slot ${slot} since that slot was taken by our own block ${this.lastBlockPublished.number}`,
        { ...syncLogData, block: this.lastBlockPublished.header.toInspect() },
      );
      return;
    }

    let proposerInNextSlot: EthAddress | undefined;
    try {
      // Check that we are a proposer for the next slot
      proposerInNextSlot = await this.publisher.epochCache.getProposerAttesterAddressInNextSlot();
    } catch (e) {
      if (e instanceof NoCommitteeError) {
        this.log.warn(
          `Cannot propose block ${newBlockNumber} at next L2 slot ${slot} since the committee does not exist on L1`,
        );
        return;
      }
    }
    const validatorAddresses = this.validatorClient!.getValidatorAddresses();

    // If get proposer in next slot is undefined, then the committee is empty and anyone may propose.
    // If the committee is defined and not empty, but none of our validators are the proposer,
    // then stop.
    if (proposerInNextSlot !== undefined && !validatorAddresses.some(addr => addr.equals(proposerInNextSlot))) {
      this.log.debug(`Cannot propose block ${newBlockNumber} since we are not a proposer`, {
        us: validatorAddresses,
        proposer: proposerInNextSlot,
        ...syncLogData,
      });
      return;
    }

    // Double check we are good for proposing at the next block before we start operations.
    // We should never fail this check assuming the logic above is good.
    const proposerAddress = proposerInNextSlot ?? EthAddress.ZERO;

    const canProposeCheck = await this.publisher.canProposeAtNextEthBlock(chainTipArchive.toBuffer(), proposerAddress);
    if (canProposeCheck === undefined) {
      this.log.warn(
        `Cannot propose block ${newBlockNumber} at slot ${slot} due to failed rollup contract check`,
        syncLogData,
      );
      this.emit('proposer-rollup-check-failed', { reason: 'Rollup contract check failed' });
      return;
    } else if (canProposeCheck.slot !== slot) {
      this.log.warn(
        `Cannot propose block due to slot mismatch with rollup contract (this can be caused by a clock out of sync). Expected slot ${slot} but got ${canProposeCheck.slot}.`,
        { ...syncLogData, rollup: canProposeCheck, newBlockNumber, expectedSlot: slot },
      );
      this.emit('proposer-rollup-check-failed', { reason: 'Slot mismatch' });
      return;
    } else if (canProposeCheck.blockNumber !== BigInt(newBlockNumber)) {
      this.log.warn(
        `Cannot propose block due to block mismatch with rollup contract (this can be caused by a pending archiver sync). Expected block ${newBlockNumber} but got ${canProposeCheck.blockNumber}.`,
        { ...syncLogData, rollup: canProposeCheck, newBlockNumber, expectedSlot: slot },
      );
      this.emit('proposer-rollup-check-failed', { reason: 'Block mismatch' });
      return;
    }

    this.log.debug(
      `${proposerInNextSlot ? `Validator ${proposerInNextSlot.toString()} can` : 'Can'} propose block ${newBlockNumber} at slot ${slot}`,
      { ...syncLogData, validatorAddresses },
    );

    const newGlobalVariables = await this.globalsBuilder.buildGlobalVariables(
      newBlockNumber,
      this.coinbase,
      this._feeRecipient,
      slot,
    );

    const enqueueGovernanceVotePromise = this.publisher.enqueueCastVote(
      slot,
      newGlobalVariables.timestamp,
      VoteType.GOVERNANCE,
      msg => this.validatorClient!.signWithAddress(proposerAddress, Buffer32.fromString(msg)).then(s => s.toString()),
    );

    const enqueueSlashingVotePromise = this.publisher.enqueueCastVote(
      slot,
      newGlobalVariables.timestamp,
      VoteType.SLASHING,
      msg => this.validatorClient!.signWithAddress(proposerAddress, Buffer32.fromString(msg)).then(s => s.toString()),
    );

    this.setState(SequencerState.INITIALIZING_PROPOSAL, slot);
    this.log.verbose(`Preparing proposal for block ${newBlockNumber} at slot ${slot}`, {
      proposer: proposerInNextSlot?.toString(),
      globalVariables: newGlobalVariables.toInspect(),
      chainTipArchive,
      blockNumber: newBlockNumber,
      slot,
    });

    // If I created a "partial" header here that should make our job much easier.
    const proposalHeader = ProposedBlockHeader.from({
      ...newGlobalVariables,
      timestamp: newGlobalVariables.timestamp,
      lastArchiveRoot: chainTipArchive,
      contentCommitment: ContentCommitment.empty(),
      totalManaUsed: Fr.ZERO,
    });

    let finishedFlushing = false;
    let block: L2Block | undefined;

    const pendingTxCount = await this.p2pClient.getPendingTxCount();
    if (pendingTxCount >= this.minTxsPerBlock || this.isFlushing) {
      // We don't fetch exactly maxTxsPerBlock txs here because we may not need all of them if we hit a limit before,
      // and also we may need to fetch more if we don't have enough valid txs.
      const pendingTxs = this.p2pClient.iteratePendingTxs();
      try {
        block = await this.buildBlockAndEnqueuePublish(
          pendingTxs,
          proposalHeader,
          newGlobalVariables,
          proposerInNextSlot,
        );
      } catch (err: any) {
        this.emit('block-build-failed', { reason: err.message });
        if (err instanceof FormattedViemError) {
          this.log.verbose(`Unable to build/enqueue block ${err.message}`);
        } else {
          this.log.error(`Error building/enqueuing block`, err, { blockNumber: newBlockNumber, slot });
        }
      } finally {
        finishedFlushing = true;
      }
    } else {
      this.log.verbose(
        `Not enough txs to build block ${newBlockNumber} at slot ${slot} (got ${pendingTxCount} txs, need ${this.minTxsPerBlock})`,
        { chainTipArchive, blockNumber: newBlockNumber, slot },
      );
      this.emit('tx-count-check-failed', { minTxs: this.minTxsPerBlock, availableTxs: pendingTxCount });
    }

    await enqueueGovernanceVotePromise.catch(err => {
      this.log.error(`Error enqueuing governance vote`, err, { blockNumber: newBlockNumber, slot });
    });
    await enqueueSlashingVotePromise.catch(err => {
      this.log.error(`Error enqueuing slashing vote`, err, { blockNumber: newBlockNumber, slot });
    });

    const l1Response = await this.publisher.sendRequests();
    const proposedBlock = l1Response?.validActions.find(a => a === 'propose');
    if (proposedBlock) {
      this.lastBlockPublished = block;
      this.emit('block-published', { blockNumber: newBlockNumber, slot: Number(slot) });
      this.metrics.incFilledSlot(this.publisher.getSenderAddress().toString());
      if (finishedFlushing) {
        this.isFlushing = false;
      }
    } else if (block) {
      this.emit('block-publish-failed', {
        validActions: l1Response?.validActions,
        expiredActions: l1Response?.expiredActions,
      });
    }

    this.setState(SequencerState.IDLE, undefined);
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
      this.setState(SequencerState.IDLE, undefined);
    }
  }

  /**
   * Sets the sequencer state and checks if we have enough time left in the slot to transition to the new state.
   * @param proposedState - The new state to transition to.
   * @param slotNumber - The current slot number.
   * @param force - Whether to force the transition even if the sequencer is stopped.
   */
  setState(proposedState: SequencerStateWithSlot, slotNumber: bigint, opts?: { force?: boolean }): void;
  setState(
    proposedState: Exclude<SequencerState, SequencerStateWithSlot>,
    slotNumber?: undefined,
    opts?: { force?: boolean },
  ): void;
  setState(proposedState: SequencerState, slotNumber: bigint | undefined, opts: { force?: boolean } = {}): void {
    if (this.state === SequencerState.STOPPED && !opts.force) {
      this.log.warn(`Cannot set sequencer from ${this.state} to ${proposedState} as it is stopped.`);
      return;
    }
    let secondsIntoSlot = undefined;
    if (slotNumber !== undefined) {
      secondsIntoSlot = this.getSecondsIntoSlot(slotNumber);
      this.timetable.assertTimeLeft(proposedState, secondsIntoSlot);
    }

    this.log.debug(`Transitioning from ${this.state} to ${proposedState}`, { slotNumber, secondsIntoSlot });
    this.emit('state-changed', {
      oldState: this.state,
      newState: proposedState,
      secondsIntoSlot,
      slotNumber,
    });
    this.state = proposedState;
  }

  private async dropFailedTxsFromP2P(failedTxs: FailedTx[]) {
    if (failedTxs.length === 0) {
      return;
    }
    const failedTxData = failedTxs.map(fail => fail.tx);
    const failedTxHashes = await Tx.getHashes(failedTxData);
    this.log.verbose(`Dropping failed txs ${failedTxHashes.join(', ')}`);
    await this.p2pClient.deleteTxs(failedTxHashes);
  }

  protected getBlockBuilderOptions(slot: number): PublicProcessorLimits {
    // Deadline for processing depends on whether we're proposing a block
    const secondsIntoSlot = this.getSecondsIntoSlot(slot);
    const processingEndTimeWithinSlot = this.timetable.getBlockProposalExecTimeEnd(secondsIntoSlot);

    // Deadline is only set if enforceTimeTable is enabled.
    const deadline = this.enforceTimeTable
      ? new Date((this.getSlotStartBuildTimestamp(slot) + processingEndTimeWithinSlot) * 1000)
      : undefined;
    return {
      maxTransactions: this.maxTxsPerBlock,
      maxBlockSize: this.maxBlockSizeInBytes,
      maxBlockGas: this.maxBlockGas,
      deadline,
    };
  }

  /**
   * @notice  Build and propose a block to the chain
   *
   * @dev     MUST throw instead of exiting early to ensure that world-state
   *          is being rolled back if the block is dropped.
   *
   * @param pendingTxs - Iterable of pending transactions to construct the block from
   * @param proposalHeader - The partial header constructed for the proposal
   * @param newGlobalVariables - The global variables for the new block
   * @param proposerAddress - The address of the proposer
   */
  @trackSpan('Sequencer.buildBlockAndEnqueuePublish', (_validTxs, _proposalHeader, newGlobalVariables) => ({
    [Attributes.BLOCK_NUMBER]: newGlobalVariables.blockNumber,
  }))
  private async buildBlockAndEnqueuePublish(
    pendingTxs: Iterable<Tx> | AsyncIterable<Tx>,
    proposalHeader: ProposedBlockHeader,
    newGlobalVariables: GlobalVariables,
    proposerAddress: EthAddress | undefined,
  ): Promise<L2Block> {
    await this.publisher.validateBlockHeader(proposalHeader);

    const blockNumber = newGlobalVariables.blockNumber;
    const slot = proposalHeader.slotNumber.toBigInt();
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(blockNumber);

    // this.metrics.recordNewBlock(blockNumber, validTxs.length);
    const workTimer = new Timer();
    this.setState(SequencerState.CREATING_BLOCK, slot);

    try {
      const blockBuilderOptions = this.getBlockBuilderOptions(Number(slot));
      const buildBlockRes = await this.blockBuilder.buildBlock(
        pendingTxs,
        l1ToL2Messages,
        newGlobalVariables,
        blockBuilderOptions,
      );
      const { publicGas, block, publicProcessorDuration, numTxs, numMsgs, blockBuildingTimer, usedTxs, failedTxs } =
        buildBlockRes;
      const blockBuildDuration = workTimer.ms();
      await this.dropFailedTxsFromP2P(failedTxs);

      const minTxsPerBlock = this.isFlushing ? 0 : this.minTxsPerBlock;

      if (numTxs < minTxsPerBlock) {
        this.log.warn(
          `Block ${blockNumber} has too few txs to be proposed (got ${numTxs} but required ${minTxsPerBlock})`,
          { slot, blockNumber, numTxs },
        );
        throw new Error(`Block has too few successful txs to be proposed`);
      }

      // TODO(@PhilWindle) We should probably periodically check for things like another
      // block being published before ours instead of just waiting on our block
      await this.publisher.validateBlockHeader(block.header.toPropose());

      const blockStats: L2BlockBuiltStats = {
        eventName: 'l2-block-built',
        creator: this.publisher.getSenderAddress().toString(),
        duration: workTimer.ms(),
        publicProcessDuration: publicProcessorDuration,
        rollupCircuitsDuration: blockBuildingTimer.ms(),
        ...block.getStats(),
      };

      const blockHash = await block.hash();
      const txHashes = block.body.txEffects.map(tx => tx.txHash);
      this.log.info(
        `Built block ${block.number} for slot ${slot} with ${numTxs} txs and ${numMsgs} messages. ${
          publicGas.l2Gas / workTimer.s()
        } mana/s`,
        {
          blockHash,
          globalVariables: block.header.globalVariables.toInspect(),
          txHashes,
          ...blockStats,
        },
      );

      this.log.debug('Collecting attestations');
      const attestations = await this.collectAttestations(block, usedTxs, proposerAddress);
      if (attestations !== undefined) {
        this.log.verbose(`Collected ${attestations.length} attestations`, { blockHash, blockNumber });
      }

      await this.enqueuePublishL2Block(block, attestations, txHashes);
      this.metrics.recordBuiltBlock(blockBuildDuration, publicGas.l2Gas);
      return block;
    } catch (err) {
      this.metrics.recordFailedBlock();
      throw err;
    }
  }

  @trackSpan('Sequencer.collectAttestations', (block, txHashes) => ({
    [Attributes.BLOCK_NUMBER]: block.number,
    [Attributes.BLOCK_ARCHIVE]: block.archive.toString(),
    [Attributes.BLOCK_TXS_COUNT]: txHashes.length,
  }))
  protected async collectAttestations(
    block: L2Block,
    txs: Tx[],
    proposerAddress: EthAddress | undefined,
  ): Promise<CommitteeAttestation[] | undefined> {
    // TODO(https://github.com/AztecProtocol/aztec-packages/issues/7962): inefficient to have a round trip in here - this should be cached
    const committee = await this.publisher.getCurrentEpochCommittee();

    // We checked above that the committee is defined, so this should never happen.
    if (!committee) {
      throw new Error('No committee when collecting attestations');
    }

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

    const slotNumber = block.header.globalVariables.slotNumber.toBigInt();
    this.setState(SequencerState.COLLECTING_ATTESTATIONS, slotNumber);

    this.log.debug('Creating block proposal for validators');
    const blockProposalOptions: BlockProposalOptions = { publishFullTxs: !!this.config.publishTxsWithProposals };
    const proposal = await this.validatorClient.createBlockProposal(
      block.header.globalVariables.blockNumber,
      block.header.toPropose(),
      block.archive.root,
      block.header.state,
      txs,
      proposerAddress,
      blockProposalOptions,
    );
    if (!proposal) {
      const msg = `Failed to create block proposal`;
      throw new Error(msg);
    }

    this.log.debug('Broadcasting block proposal to validators');
    await this.validatorClient.broadcastBlockProposal(proposal);

    const attestationTimeAllowed = this.enforceTimeTable
      ? this.timetable.getMaxAllowedTime(SequencerState.PUBLISHING_BLOCK)!
      : this.aztecSlotDuration;

    this.metrics.recordRequiredAttestations(numberOfRequiredAttestations, attestationTimeAllowed);

    const timer = new Timer();
    let collectedAttestionsCount: number = 0;
    try {
      const attestationDeadline = new Date(this.dateProvider.now() + attestationTimeAllowed * 1000);
      const attestations = await this.validatorClient.collectAttestations(
        proposal,
        numberOfRequiredAttestations,
        attestationDeadline,
      );

      collectedAttestionsCount = attestations.length;

      // note: the smart contract requires that the signatures are provided in the order of the committee
      return orderAttestations(attestations, committee);
    } catch (err) {
      if (err && err instanceof AttestationTimeoutError) {
        collectedAttestionsCount = err.collectedCount;
      }

      throw err;
    } finally {
      this.metrics.recordCollectedAttestations(collectedAttestionsCount, timer.ms());
    }
  }

  /**
   * Publishes the L2Block to the rollup contract.
   * @param block - The L2Block to be published.
   */
  @trackSpan('Sequencer.enqueuePublishL2Block', block => ({
    [Attributes.BLOCK_NUMBER]: block.number,
  }))
  protected async enqueuePublishL2Block(
    block: L2Block,
    attestations?: CommitteeAttestation[],
    txHashes?: TxHash[],
  ): Promise<void> {
    // Publishes new block to the network and awaits the tx to be mined
    this.setState(SequencerState.PUBLISHING_BLOCK, block.header.globalVariables.slotNumber.toBigInt());

    // Time out tx at the end of the slot
    const slot = block.header.globalVariables.slotNumber.toNumber();
    const txTimeoutAt = new Date((this.getSlotStartBuildTimestamp(slot) + this.aztecSlotDuration) * 1000);

    const enqueued = await this.publisher.enqueueProposeL2Block(block, attestations, txHashes, {
      txTimeoutAt,
    });

    if (!enqueued) {
      throw new Error(`Failed to enqueue publish of block ${block.number}`);
    }
  }

  /**
   * Returns whether all dependencies have caught up.
   * We don't check against the previous block submitted since it may have been reorg'd out.
   * @returns Boolean indicating if our dependencies are synced to the latest block.
   */
  protected async getChainTip(): Promise<
    { block?: L2Block; blockNumber: number; archive: Fr; l1Timestamp: bigint } | undefined
  > {
    const syncedBlocks = await Promise.all([
      this.worldState.status().then(({ syncSummary }) => ({
        number: syncSummary.latestBlockNumber,
        hash: syncSummary.latestBlockHash,
      })),
      this.l2BlockSource.getL2Tips().then(t => t.latest),
      this.p2pClient.getStatus().then(p2p => p2p.syncedToL2Block),
      this.l1ToL2MessageSource.getL2Tips().then(t => t.latest),
      this.l2BlockSource.getL1Timestamp(),
    ] as const);

    const [worldState, l2BlockSource, p2p, l1ToL2MessageSource, l1Timestamp] = syncedBlocks;

    // The archiver reports 'undefined' hash for the genesis block
    // because it doesn't have access to world state to compute it (facepalm)
    const result =
      l2BlockSource.hash === undefined
        ? worldState.number === 0 && p2p.number === 0 && l1ToL2MessageSource.number === 0
        : worldState.hash === l2BlockSource.hash &&
          p2p.hash === l2BlockSource.hash &&
          l1ToL2MessageSource.hash === l2BlockSource.hash;

    const logData = { worldState, l2BlockSource, p2p, l1ToL2MessageSource };
    this.log.debug(`Sequencer sync check ${result ? 'succeeded' : 'failed'}`, logData);

    if (!result) {
      return undefined;
    }

    const blockNumber = worldState.number;
    if (blockNumber >= INITIAL_L2_BLOCK_NUM) {
      const block = await this.l2BlockSource.getBlock(blockNumber);
      if (!block) {
        // this shouldn't really happen because a moment ago we checked that all components were in sync
        this.log.warn(`Failed to get L2 block ${blockNumber} from the archiver with all components in sync`, logData);
        return undefined;
      }

      return {
        block,
        blockNumber: block.number,
        archive: block.archive.root,
        l1Timestamp,
      };
    } else {
      const archive = new Fr((await this.worldState.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE)).root);
      return { blockNumber: INITIAL_L2_BLOCK_NUM - 1, archive, l1Timestamp };
    }
  }

  private getSlotStartBuildTimestamp(slotNumber: number | bigint): number {
    return (
      Number(this.l1Constants.l1GenesisTime) +
      Number(slotNumber) * this.l1Constants.slotDuration -
      this.l1Constants.ethereumSlotDuration
    );
  }

  private getSecondsIntoSlot(slotNumber: number | bigint): number {
    const slotStartTimestamp = this.getSlotStartBuildTimestamp(slotNumber);
    return Number((this.dateProvider.now() / 1000 - slotStartTimestamp).toFixed(3));
  }

  get aztecSlotDuration() {
    return this.l1Constants.slotDuration;
  }

  get coinbase(): EthAddress {
    if (this._coinbase.isZero()) {
      this.log.debug(`Coinbase is zero, using publisher sender address`, this.publisher.getSenderAddress());
      return this.publisher.getSenderAddress();
    }
    return this._coinbase;
  }

  get feeRecipient(): AztecAddress {
    return this._feeRecipient;
  }

  get maxL2BlockGas(): number | undefined {
    return this.config.maxL2BlockGas;
  }

  public getSlasherClient(): SlasherClient {
    return this.slasherClient;
  }
}
