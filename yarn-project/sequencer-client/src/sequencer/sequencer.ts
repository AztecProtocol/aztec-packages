import type { L2Block } from '@aztec/aztec.js';
import { BLOBS_PER_BLOCK, FIELDS_PER_BLOB, INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import { FormattedViemError, NoCommitteeError, type RollupContract } from '@aztec/ethereum';
import { omit, pick } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { type DateProvider, Timer } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { P2P } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import {
  type CommitteeAttestation,
  CommitteeAttestationsAndSigners,
  type L2BlockSource,
  type ValidateBlockResult,
} from '@aztec/stdlib/block';
import { type L1RollupConstants, getSlotAtTimestamp, getSlotStartBuildTimestamp } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import {
  type IFullNodeBlockBuilder,
  type PublicProcessorLimits,
  SequencerConfigSchema,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { BlockProposalOptions } from '@aztec/stdlib/p2p';
import { orderAttestations } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { pickFromSchema } from '@aztec/stdlib/schemas';
import type { L2BlockBuiltStats } from '@aztec/stdlib/stats';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { ContentCommitment, type FailedTx, GlobalVariables, Tx } from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';
import { Attributes, type TelemetryClient, type Tracer, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';
import type { ValidatorClient } from '@aztec/validator-client';

import EventEmitter from 'node:events';
import type { TypedDataDefinition } from 'viem';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import type { Action, InvalidateBlockRequest, SequencerPublisher } from '../publisher/sequencer-publisher.js';
import type { SequencerConfig } from './config.js';
import { SequencerInterruptedError, SequencerTooSlowError } from './errors.js';
import { SequencerMetrics } from './metrics.js';
import { SequencerTimetable } from './timetable.js';
import { SequencerState, type SequencerStateWithSlot } from './utils.js';

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
  ['block-publish-failed']: (args: {
    successfulActions?: Action[];
    failedActions?: Action[];
    sentActions?: Action[];
    expiredActions?: Action[];
  }) => void;
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
  private state = SequencerState.STOPPED;
  private maxBlockSizeInBytes: number = 1024 * 1024;
  private maxBlockGas: Gas = new Gas(100e9, 100e9);
  private metrics: SequencerMetrics;

  private lastBlockPublished: L2Block | undefined;

  private governanceProposerPayload: EthAddress | undefined;

  /** The maximum number of seconds that the sequencer can be into a slot to transition to a particular state. */
  protected timetable!: SequencerTimetable;
  protected enforceTimeTable: boolean = false;

  // This shouldn't be here as this gets re-created each time we build/propose a block.
  // But we have a number of tests that abuse/rely on this class having a permanent publisher.
  // As long as those tests only configure a single publisher they will continue to work.
  // This will get re-assigned every time the sequencer goes to build a new block to a publisher that is valid
  // for the block proposer.
  protected publisher: SequencerPublisher | undefined;

  constructor(
    protected publisherFactory: SequencerPublisherFactory,
    protected validatorClient: ValidatorClient | undefined, // During migration the validator client can be inactive
    protected globalsBuilder: GlobalVariableBuilder,
    protected p2pClient: P2P,
    protected worldState: WorldStateSynchronizer,
    protected slasherClient: SlasherClientInterface | undefined,
    protected l2BlockSource: L2BlockSource,
    protected l1ToL2MessageSource: L1ToL2MessageSource,
    protected blockBuilder: IFullNodeBlockBuilder,
    protected l1Constants: SequencerRollupConstants,
    protected dateProvider: DateProvider,
    protected epochCache: EpochCache,
    protected rollupContract: RollupContract,
    protected config: SequencerConfig,
    protected telemetry: TelemetryClient = getTelemetryClient(),
    protected log = createLogger('sequencer'),
  ) {
    super();

    this.metrics = new SequencerMetrics(telemetry, this.rollupContract, 'Sequencer');
    // Initialize config
    this.updateConfig(this.config);
  }

  get tracer(): Tracer {
    return this.metrics.tracer;
  }

  public getValidatorAddresses() {
    return this.validatorClient?.getValidatorAddresses();
  }

  public getConfig() {
    return this.config;
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
    if (config.maxBlockSizeInBytes !== undefined) {
      this.maxBlockSizeInBytes = config.maxBlockSizeInBytes;
    }
    if (config.governanceProposerPayload) {
      this.governanceProposerPayload = config.governanceProposerPayload;
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

  public async init() {
    this.publisher = (await this.publisherFactory.create(undefined)).publisher;
  }

  /**
   * Starts the sequencer and moves to IDLE state.
   */
  public start() {
    this.runningPromise = new RunningPromise(this.work.bind(this), this.log, this.pollingIntervalMs);
    this.setState(SequencerState.IDLE, undefined, { force: true });
    this.runningPromise.start();
    this.log.info('Started sequencer');
  }

  /**
   * Stops the sequencer from processing txs and moves to STOPPED state.
   */
  public async stop(): Promise<void> {
    this.log.info(`Stopping sequencer`);
    this.setState(SequencerState.STOPPING, undefined, { force: true });
    this.publisher?.interrupt();
    await this.runningPromise?.stop();
    this.setState(SequencerState.STOPPED, undefined, { force: true });
    this.log.info('Stopped sequencer');
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
    this.setState(SequencerState.SYNCHRONIZING, undefined);

    // Check all components are synced to latest as seen by the archiver
    const syncedTo = await this.getChainTip();

    // Do not go forward with new block if the previous one has not been mined and processed
    if (!syncedTo) {
      return;
    }

    const chainTipArchive = syncedTo.archive;
    const newBlockNumber = syncedTo.blockNumber + 1;

    const { slot, ts, now } = this.epochCache.getEpochAndSlotInNextL1Slot();

    this.setState(SequencerState.PROPOSER_CHECK, slot);

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
      newBlockNumber,
      isPendingChainValid: pick(syncedTo.pendingChainValidationStatus, 'valid', 'reason', 'invalidIndex'),
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

    // Check that we are a proposer for the next slot
    let proposerInNextSlot: EthAddress | undefined;
    try {
      proposerInNextSlot = await this.epochCache.getProposerAttesterAddressInNextSlot();
    } catch (e) {
      if (e instanceof NoCommitteeError) {
        this.log.warn(
          `Cannot propose block ${newBlockNumber} at next L2 slot ${slot} since the committee does not exist on L1`,
        );
        return;
      }
    }

    // If get proposer in next slot is undefined, then the committee is empty and anyone may propose.
    // If the committee is defined and not empty, but none of our validators are the proposer, then stop.
    const validatorAddresses = this.validatorClient!.getValidatorAddresses();
    if (proposerInNextSlot !== undefined && !validatorAddresses.some(addr => addr.equals(proposerInNextSlot))) {
      this.log.debug(`Cannot propose block ${newBlockNumber} since we are not a proposer`, {
        us: validatorAddresses,
        proposer: proposerInNextSlot,
        ...syncLogData,
      });
      // If the pending chain is invalid, we may need to invalidate the block if no one else is doing it.
      if (!syncedTo.pendingChainValidationStatus.valid) {
        // We pass i undefined here to get any available publisher.
        const { publisher } = await this.publisherFactory.create(undefined);
        await this.considerInvalidatingBlock(syncedTo, slot, validatorAddresses, publisher);
      }
      return;
    }

    // Check with the rollup if we can indeed propose at the next L2 slot. This check should not fail
    // if all the previous checks are good, but we do it just in case.
    const proposerAddressInNextSlot = proposerInNextSlot ?? EthAddress.ZERO;

    // We now need to get ourselves a publisher.
    // The returned attestor will be the one we provided if we provided one.
    // Otherwise it will be a valid attestor for the returned publisher.
    const { attestorAddress, publisher } = await this.publisherFactory.create(proposerInNextSlot);

    this.log.verbose(`Created publisher at address ${publisher.getSenderAddress()} for attestor ${attestorAddress}`);

    this.publisher = publisher;

    const coinbase = this.validatorClient!.getCoinbaseForAttestor(attestorAddress);
    const feeRecipient = this.validatorClient!.getFeeRecipientForAttestor(attestorAddress);

    // Prepare invalidation request if the pending chain is invalid (returns undefined if no need)
    const invalidateBlock = await publisher.simulateInvalidateBlock(syncedTo.pendingChainValidationStatus);
    const canProposeCheck = await publisher.canProposeAtNextEthBlock(
      chainTipArchive,
      proposerAddressInNextSlot,
      invalidateBlock,
    );

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
      `Can propose block ${newBlockNumber} at slot ${slot}` + (proposerInNextSlot ? ` as ${proposerInNextSlot}` : ''),
      { ...syncLogData, validatorAddresses },
    );

    const newGlobalVariables = await this.globalsBuilder.buildGlobalVariables(
      newBlockNumber,
      coinbase,
      feeRecipient,
      slot,
    );

    const { timestamp } = newGlobalVariables;
    const signerFn = (msg: TypedDataDefinition) =>
      this.validatorClient!.signWithAddress(attestorAddress, msg).then(s => s.toString());

    const enqueueGovernanceSignalPromise =
      this.governanceProposerPayload && !this.governanceProposerPayload.isZero()
        ? publisher
            .enqueueGovernanceCastSignal(this.governanceProposerPayload, slot, timestamp, attestorAddress, signerFn)
            .catch(err => {
              this.log.error(`Error enqueuing governance vote`, err, { blockNumber: newBlockNumber, slot });
              return false;
            })
        : Promise.resolve(false);

    const enqueueSlashingActionsPromise = this.slasherClient
      ? this.slasherClient
          .getProposerActions(slot)
          .then(actions => publisher.enqueueSlashingActions(actions, slot, timestamp, attestorAddress, signerFn))
          .catch(err => {
            this.log.error(`Error enqueuing slashing actions`, err, { blockNumber: newBlockNumber, slot });
            return false;
          })
      : Promise.resolve(false);

    if (invalidateBlock && !this.config.skipInvalidateBlockAsProposer) {
      publisher.enqueueInvalidateBlock(invalidateBlock);
    }

    this.setState(SequencerState.INITIALIZING_PROPOSAL, slot);

    this.metrics.incOpenSlot(slot, proposerAddressInNextSlot.toString());
    this.log.verbose(`Preparing proposal for block ${newBlockNumber} at slot ${slot}`, {
      proposer: proposerInNextSlot?.toString(),
      coinbase,
      publisher: publisher.getSenderAddress(),
      feeRecipient,
      globalVariables: newGlobalVariables.toInspect(),
      chainTipArchive,
      blockNumber: newBlockNumber,
      slot,
    });

    // If I created a "partial" header here that should make our job much easier.
    const proposalHeader = CheckpointHeader.from({
      ...newGlobalVariables,
      timestamp: newGlobalVariables.timestamp,
      lastArchiveRoot: chainTipArchive,
      contentCommitment: ContentCommitment.empty(),
      totalManaUsed: Fr.ZERO,
    });

    let block: L2Block | undefined;

    const pendingTxCount = await this.p2pClient.getPendingTxCount();
    if (pendingTxCount >= this.minTxsPerBlock) {
      // We don't fetch exactly maxTxsPerBlock txs here because we may not need all of them if we hit a limit before,
      // and also we may need to fetch more if we don't have enough valid txs.
      const pendingTxs = this.p2pClient.iteratePendingTxs();
      try {
        block = await this.buildBlockAndEnqueuePublish(
          pendingTxs,
          proposalHeader,
          newGlobalVariables,
          proposerInNextSlot,
          invalidateBlock,
          publisher,
        );
      } catch (err: any) {
        this.emit('block-build-failed', { reason: err.message });
        if (err instanceof FormattedViemError) {
          this.log.verbose(`Unable to build/enqueue block ${err.message}`);
        } else {
          this.log.error(`Error building/enqueuing block`, err, { blockNumber: newBlockNumber, slot });
        }
      }
    } else {
      this.log.verbose(
        `Not enough txs to build block ${newBlockNumber} at slot ${slot} (got ${pendingTxCount} txs, need ${this.minTxsPerBlock})`,
        { chainTipArchive, blockNumber: newBlockNumber, slot },
      );
      this.emit('tx-count-check-failed', { minTxs: this.minTxsPerBlock, availableTxs: pendingTxCount });
    }

    await Promise.all([enqueueGovernanceSignalPromise, enqueueSlashingActionsPromise]);

    const l1Response = await publisher.sendRequests();
    const proposedBlock = l1Response?.successfulActions.find(a => a === 'propose');
    if (proposedBlock) {
      this.lastBlockPublished = block;
      this.emit('block-published', { blockNumber: newBlockNumber, slot: Number(slot) });
      await this.metrics.incFilledSlot(publisher.getSenderAddress().toString(), coinbase);
    } else if (block) {
      this.emit('block-publish-failed', l1Response ?? {});
    }

    this.setState(SequencerState.IDLE, undefined);
  }

  @trackSpan('Sequencer.work')
  protected async work() {
    try {
      await this.doRealWork();
    } catch (err) {
      if (err instanceof SequencerTooSlowError) {
        // Log as warn only if we had to abort halfway through the block proposal
        const logLvl = [SequencerState.INITIALIZING_PROPOSAL, SequencerState.PROPOSER_CHECK].includes(err.proposedState)
          ? ('debug' as const)
          : ('warn' as const);
        this.log[logLvl](err.message, { now: this.dateProvider.nowInSeconds() });
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
    if (this.state === SequencerState.STOPPING && proposedState !== SequencerState.STOPPED && !opts.force) {
      this.log.warn(`Cannot set sequencer to ${proposedState} as it is stopping.`);
      throw new SequencerInterruptedError();
    }
    if (this.state === SequencerState.STOPPED && !opts.force) {
      this.log.warn(`Cannot set sequencer from ${this.state} to ${proposedState} as it is stopped.`);
      return;
    }
    let secondsIntoSlot = undefined;
    if (slotNumber !== undefined) {
      secondsIntoSlot = this.getSecondsIntoSlot(slotNumber);
      this.timetable.assertTimeLeft(proposedState, secondsIntoSlot);
    }

    const boringStates = [SequencerState.IDLE, SequencerState.SYNCHRONIZING];
    const logLevel =
      boringStates.includes(proposedState) && boringStates.includes(this.state)
        ? ('trace' as const)
        : ('debug' as const);
    this.log[logLevel](`Transitioning from ${this.state} to ${proposedState}`, { slotNumber, secondsIntoSlot });

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
    const failedTxHashes = failedTxData.map(tx => tx.getTxHash());
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
      maxBlobFields: BLOBS_PER_BLOCK * FIELDS_PER_BLOB,
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
    proposalHeader: CheckpointHeader,
    newGlobalVariables: GlobalVariables,
    proposerAddress: EthAddress | undefined,
    invalidateBlock: InvalidateBlockRequest | undefined,
    publisher: SequencerPublisher,
  ): Promise<L2Block> {
    await publisher.validateBlockHeader(proposalHeader, invalidateBlock);

    const blockNumber = newGlobalVariables.blockNumber;
    const slot = proposalHeader.slotNumber.toBigInt();
    const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(blockNumber);

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

      const minTxsPerBlock = this.minTxsPerBlock;
      if (numTxs < minTxsPerBlock) {
        this.log.warn(
          `Block ${blockNumber} has too few txs to be proposed (got ${numTxs} but required ${minTxsPerBlock})`,
          { slot, blockNumber, numTxs },
        );
        throw new Error(`Block has too few successful txs to be proposed`);
      }

      // TODO(@PhilWindle) We should probably periodically check for things like another
      // block being published before ours instead of just waiting on our block
      await publisher.validateBlockHeader(block.getCheckpointHeader(), invalidateBlock);

      const blockStats: L2BlockBuiltStats = {
        eventName: 'l2-block-built',
        creator: proposerAddress?.toString() ?? publisher.getSenderAddress().toString(),
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

      const attestationsAndSigners = new CommitteeAttestationsAndSigners(attestations ?? []);
      const attestationsAndSignersSignature = this.validatorClient
        ? await this.validatorClient.signAttestationsAndSigners(
            attestationsAndSigners,
            proposerAddress ?? publisher.getSenderAddress(),
          )
        : Signature.empty();

      await this.enqueuePublishL2Block(
        block,
        attestationsAndSigners,
        attestationsAndSignersSignature,
        invalidateBlock,
        publisher,
      );
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
    const { committee } = await this.epochCache.getCommittee(block.header.getSlot());

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
    const blockProposalOptions: BlockProposalOptions = {
      publishFullTxs: !!this.config.publishTxsWithProposals,
      broadcastInvalidBlockProposal: this.config.broadcastInvalidBlockProposal,
    };
    const proposal = await this.validatorClient.createBlockProposal(
      block.header.globalVariables.blockNumber,
      block.getCheckpointHeader(),
      block.archive.root,
      block.header.state,
      txs,
      proposerAddress,
      blockProposalOptions,
    );

    if (!proposal) {
      throw new Error(`Failed to create block proposal`);
    }

    if (this.config.skipCollectingAttestations) {
      this.log.warn('Skipping attestation collection as per config (attesting with own keys only)');
      const attestations = await this.validatorClient?.collectOwnAttestations(proposal);
      return orderAttestations(attestations ?? [], committee);
    }

    this.log.debug('Broadcasting block proposal to validators');
    await this.validatorClient.broadcastBlockProposal(proposal);

    const attestationTimeAllowed = this.enforceTimeTable
      ? this.timetable.getMaxAllowedTime(SequencerState.PUBLISHING_BLOCK)!
      : this.aztecSlotDuration;

    this.metrics.recordRequiredAttestations(numberOfRequiredAttestations, attestationTimeAllowed);

    const timer = new Timer();
    let collectedAttestationsCount: number = 0;
    try {
      const attestationDeadline = new Date(this.dateProvider.now() + attestationTimeAllowed * 1000);
      const attestations = await this.validatorClient.collectAttestations(
        proposal,
        numberOfRequiredAttestations,
        attestationDeadline,
      );

      collectedAttestationsCount = attestations.length;

      // note: the smart contract requires that the signatures are provided in the order of the committee
      return orderAttestations(attestations, committee);
    } catch (err) {
      if (err && err instanceof AttestationTimeoutError) {
        collectedAttestationsCount = err.collectedCount;
      }
      throw err;
    } finally {
      this.metrics.recordCollectedAttestations(collectedAttestationsCount, timer.ms());
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
    attestationsAndSigners: CommitteeAttestationsAndSigners,
    attestationsAndSignersSignature: Signature,
    invalidateBlock: InvalidateBlockRequest | undefined,
    publisher: SequencerPublisher,
  ): Promise<void> {
    // Publishes new block to the network and awaits the tx to be mined
    this.setState(SequencerState.PUBLISHING_BLOCK, block.header.globalVariables.slotNumber.toBigInt());

    // Time out tx at the end of the slot
    const slot = block.header.globalVariables.slotNumber.toNumber();
    const txTimeoutAt = new Date((this.getSlotStartBuildTimestamp(slot) + this.aztecSlotDuration) * 1000);

    const enqueued = await publisher.enqueueProposeL2Block(
      block,
      attestationsAndSigners,
      attestationsAndSignersSignature,
      {
        txTimeoutAt,
        forcePendingBlockNumber: invalidateBlock?.forcePendingBlockNumber,
      },
    );

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
    | {
        block?: L2Block;
        blockNumber: number;
        archive: Fr;
        l1Timestamp: bigint;
        pendingChainValidationStatus: ValidateBlockResult;
      }
    | undefined
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
      this.l2BlockSource.getPendingChainValidationStatus(),
    ] as const);

    const [worldState, l2BlockSource, p2p, l1ToL2MessageSource, l1Timestamp, pendingChainValidationStatus] =
      syncedBlocks;

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
        pendingChainValidationStatus,
      };
    } else {
      const archive = new Fr((await this.worldState.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE)).root);
      return { blockNumber: INITIAL_L2_BLOCK_NUM - 1, archive, l1Timestamp, pendingChainValidationStatus };
    }
  }

  /**
   * Considers invalidating a block if the pending chain is invalid. Depends on how long the invalid block
   * has been there without being invalidated and whether the sequencer is in the committee or not. We always
   * have the proposer try to invalidate, but if they fail, the sequencers in the committee are expected to try,
   * and if they fail, any sequencer will try as well.
   */
  protected async considerInvalidatingBlock(
    syncedTo: NonNullable<Awaited<ReturnType<Sequencer['getChainTip']>>>,
    currentSlot: bigint,
    ourValidatorAddresses: EthAddress[],
    publisher: SequencerPublisher,
  ): Promise<void> {
    const { pendingChainValidationStatus, l1Timestamp } = syncedTo;
    if (pendingChainValidationStatus.valid) {
      return;
    }

    const invalidBlockNumber = pendingChainValidationStatus.block.blockNumber;
    const invalidBlockTimestamp = pendingChainValidationStatus.block.timestamp;
    const timeSinceChainInvalid = this.dateProvider.nowInSeconds() - Number(invalidBlockTimestamp);

    const { secondsBeforeInvalidatingBlockAsCommitteeMember, secondsBeforeInvalidatingBlockAsNonCommitteeMember } =
      this.config;

    const logData = {
      invalidL1Timestamp: invalidBlockTimestamp,
      l1Timestamp,
      invalidBlock: pendingChainValidationStatus.block,
      secondsBeforeInvalidatingBlockAsCommitteeMember,
      secondsBeforeInvalidatingBlockAsNonCommitteeMember,
      ourValidatorAddresses,
      currentSlot,
    };

    const inCurrentCommittee = () =>
      this.epochCache
        .getCommittee(currentSlot)
        .then(c => c?.committee?.some(member => ourValidatorAddresses.some(addr => addr.equals(member))));

    const invalidateAsCommitteeMember =
      secondsBeforeInvalidatingBlockAsCommitteeMember !== undefined &&
      secondsBeforeInvalidatingBlockAsCommitteeMember > 0 &&
      timeSinceChainInvalid > secondsBeforeInvalidatingBlockAsCommitteeMember &&
      (await inCurrentCommittee());

    const invalidateAsNonCommitteeMember =
      secondsBeforeInvalidatingBlockAsNonCommitteeMember !== undefined &&
      secondsBeforeInvalidatingBlockAsNonCommitteeMember > 0 &&
      timeSinceChainInvalid > secondsBeforeInvalidatingBlockAsNonCommitteeMember;

    if (!invalidateAsCommitteeMember && !invalidateAsNonCommitteeMember) {
      this.log.debug(`Not invalidating pending chain`, logData);
      return;
    }

    const invalidateBlock = await publisher.simulateInvalidateBlock(pendingChainValidationStatus);
    if (!invalidateBlock) {
      this.log.warn(`Failed to simulate invalidate block`, logData);
      return;
    }

    this.log.info(
      invalidateAsCommitteeMember
        ? `Invalidating block ${invalidBlockNumber} as committee member`
        : `Invalidating block ${invalidBlockNumber} as non-committee member`,
      logData,
    );

    publisher.enqueueInvalidateBlock(invalidateBlock);
    await publisher.sendRequests();
  }

  private getSlotStartBuildTimestamp(slotNumber: number | bigint): number {
    return getSlotStartBuildTimestamp(slotNumber, this.l1Constants);
  }

  private getSecondsIntoSlot(slotNumber: number | bigint): number {
    const slotStartTimestamp = this.getSlotStartBuildTimestamp(slotNumber);
    return Number((this.dateProvider.now() / 1000 - slotStartTimestamp).toFixed(3));
  }

  get aztecSlotDuration() {
    return this.l1Constants.slotDuration;
  }

  get maxL2BlockGas(): number | undefined {
    return this.config.maxL2BlockGas;
  }

  public getSlasherClient(): SlasherClientInterface | undefined {
    return this.slasherClient;
  }
}
