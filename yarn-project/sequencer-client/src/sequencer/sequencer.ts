import { getKzg } from '@aztec/blob-lib';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/constants';
import type { EpochCache } from '@aztec/epoch-cache';
import { NoCommitteeError, type RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { merge, omit, pick } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { DateProvider } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { P2P } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import type { L2Block, L2BlockSink, L2BlockSource, ValidateCheckpointResult } from '@aztec/stdlib/block';
import type { Checkpoint } from '@aztec/stdlib/checkpoint';
import { getSlotAtTimestamp, getSlotStartBuildTimestamp } from '@aztec/stdlib/epoch-helpers';
import {
  type ResolvedSequencerConfig,
  type SequencerConfig,
  SequencerConfigSchema,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { pickFromSchema } from '@aztec/stdlib/schemas';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { Attributes, type TelemetryClient, type Tracer, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';
import { FullNodeCheckpointsBuilder, type ValidatorClient } from '@aztec/validator-client';

import EventEmitter from 'node:events';

import { DefaultSequencerConfig } from '../config.js';
import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import type { InvalidateCheckpointRequest, SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { CheckpointProposalJob } from './checkpoint_proposal_job.js';
import { CheckpointVoter } from './checkpoint_voter.js';
import { SequencerInterruptedError, SequencerTooSlowError } from './errors.js';
import type { SequencerEvents } from './events.js';
import { SequencerMetrics } from './metrics.js';
import { SequencerTimetable } from './timetable.js';
import type { SequencerRollupConstants } from './types.js';
import { SequencerState } from './utils.js';

export { SequencerState };

/**
 * Sequencer client
 * - Checks whether it is elected as proposer for the next slot
 * - Builds multiple blocks and broadcasts them
 * - Collects attestations for the checkpoint
 * - Publishes the checkpoint to L1
 * - Votes for proposals and slashes on L1
 */
export class Sequencer extends (EventEmitter as new () => TypedEventEmitter<SequencerEvents>) {
  private runningPromise?: RunningPromise;
  private state = SequencerState.STOPPED;
  private metrics: SequencerMetrics;

  /** The last slot for which we attempted to perform our voting duties with degraded block production */
  private lastSlotForFallbackVote: SlotNumber | undefined;

  /** The last slot for which we logged "no committee" warning, to avoid spam */
  private lastSlotForNoCommitteeWarning: SlotNumber | undefined;

  /** The last slot for which we triggered a checkpoint proposal job, to prevent duplicate attempts. */
  private lastSlotForCheckpointProposalJob: SlotNumber | undefined;

  /** Last successful checkpoint proposed */
  private lastCheckpointProposed: Checkpoint | undefined;

  /** The last epoch for which we logged strategy comparison in fisherman mode. */
  private lastEpochForStrategyComparison: EpochNumber | undefined;

  /** The maximum number of seconds that the sequencer can be into a slot to transition to a particular state. */
  protected timetable!: SequencerTimetable;

  // This shouldn't be here as this gets re-created each time we build/propose a block.
  // But we have a number of tests that abuse/rely on this class having a permanent publisher.
  // As long as those tests only configure a single publisher they will continue to work.
  // This will get re-assigned every time the sequencer goes to build a new block to a publisher that is valid
  // for the block proposer.
  // TODO(palla/mbps): Remove this field and fix tests
  protected publisher: SequencerPublisher | undefined;

  /** Config for the sequencer */
  protected config: ResolvedSequencerConfig = DefaultSequencerConfig;

  constructor(
    protected publisherFactory: SequencerPublisherFactory,
    protected validatorClient: ValidatorClient,
    protected globalsBuilder: GlobalVariableBuilder,
    protected p2pClient: P2P,
    protected worldState: WorldStateSynchronizer,
    protected slasherClient: SlasherClientInterface | undefined,
    protected l2BlockSource: L2BlockSource & L2BlockSink,
    protected l1ToL2MessageSource: L1ToL2MessageSource,
    protected checkpointsBuilder: FullNodeCheckpointsBuilder,
    protected l1Constants: SequencerRollupConstants,
    protected dateProvider: DateProvider,
    protected epochCache: EpochCache,
    protected rollupContract: RollupContract,
    config: SequencerConfig,
    protected telemetry: TelemetryClient = getTelemetryClient(),
    protected log = createLogger('sequencer'),
  ) {
    super();

    // Add [FISHERMAN] prefix to logger if in fisherman mode
    if (config.fishermanMode) {
      this.log = log.createChild('[FISHERMAN]');
    }

    this.metrics = new SequencerMetrics(telemetry, this.rollupContract, 'Sequencer');
    this.updateConfig(config);
  }

  /** Updates sequencer config by the defined values and updates the timetable */
  public updateConfig(config: Partial<SequencerConfig>) {
    const filteredConfig = pickFromSchema(config, SequencerConfigSchema);
    this.log.info(`Updated sequencer config`, omit(filteredConfig, 'txPublicSetupAllowList'));
    this.config = merge(this.config, filteredConfig);
    this.timetable = new SequencerTimetable(
      {
        ethereumSlotDuration: this.l1Constants.ethereumSlotDuration,
        aztecSlotDuration: this.aztecSlotDuration,
        l1PublishingTime: this.l1PublishingTime,
        p2pPropagationTime: this.config.attestationPropagationTime,
        blockDurationMs: this.config.blockDurationMs,
        enforce: this.config.enforceTimeTable,
      },
      this.metrics,
      this.log,
    );
  }

  /** Initializes the sequencer (precomputes tables and creates a publisher). Takes about 3s. */
  public async init() {
    getKzg();
    this.publisher = (await this.publisherFactory.create(undefined)).publisher;
  }

  /** Starts the sequencer and moves to IDLE state. */
  public start() {
    this.runningPromise = new RunningPromise(
      this.safeWork.bind(this),
      this.log,
      this.config.sequencerPollingIntervalMS,
    );
    this.setState(SequencerState.IDLE, undefined, { force: true });
    this.runningPromise.start();
    this.log.info('Started sequencer');
  }

  /** Stops the sequencer from building blocks and moves to STOPPED state. */
  public async stop(): Promise<void> {
    this.log.info(`Stopping sequencer`);
    this.setState(SequencerState.STOPPING, undefined, { force: true });
    this.publisher?.interrupt();
    await this.runningPromise?.stop();
    this.setState(SequencerState.STOPPED, undefined, { force: true });
    this.log.info('Stopped sequencer');
  }

  /** Main sequencer loop with a try/catch */
  protected async safeWork() {
    try {
      await this.work();
    } catch (err) {
      this.emit('checkpoint-error', { error: err as Error });
      if (err instanceof SequencerTooSlowError) {
        // TODO(palla/mbps): Add missing states
        // Log as warn only if we had to abort halfway through the block proposal
        const logLvl = [SequencerState.INITIALIZING_CHECKPOINT, SequencerState.PROPOSER_CHECK].includes(
          err.proposedState,
        )
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

  /** Returns the current state of the sequencer. */
  public status() {
    return { state: this.state };
  }

  /**
   * Main sequencer loop:
   * - Checks if we are up to date
   * - If we are and we are the sequencer, collect txs and build blocks
   * - Build multiple blocks per slot when configured
   * - Collect attestations for the final block
   * - Submit checkpoint
   */
  @trackSpan('Sequencer.work')
  protected async work() {
    this.setState(SequencerState.SYNCHRONIZING, undefined);
    const { slot, ts, now, epoch } = this.epochCache.getEpochAndSlotInNextL1Slot();

    // Check if we are synced and it's our slot, grab a publisher, check previous block invalidation, etc
    const checkpointProposalJob = await this.prepareCheckpointProposal(epoch, slot, ts, now);
    if (!checkpointProposalJob) {
      return;
    }

    // Execute the checkpoint proposal job
    const checkpoint = await checkpointProposalJob.execute();

    // Update last checkpoint proposed (currently unused)
    if (checkpoint) {
      this.lastCheckpointProposed = checkpoint;
    }

    // Log fee strategy comparison if on fisherman
    if (
      this.config.fishermanMode &&
      (this.lastEpochForStrategyComparison === undefined || epoch > this.lastEpochForStrategyComparison)
    ) {
      this.logStrategyComparison(epoch, checkpointProposalJob.getPublisher());
      this.lastEpochForStrategyComparison = epoch;
    }

    return checkpoint;
  }

  /**
   * Prepares the checkpoint proposal by performing all necessary checks and setup.
   * This is the initial step in the main loop.
   * @returns CheckpointProposalJob if successful, undefined if we are not yet synced or are not the proposer.
   */
  @trackSpan('Sequencer.prepareCheckpointProposal')
  private async prepareCheckpointProposal(
    epoch: EpochNumber,
    slot: SlotNumber,
    ts: bigint,
    now: bigint,
  ): Promise<CheckpointProposalJob | undefined> {
    // Check we have not already processed this slot (cheapest check)
    // We only check this if enforce timetable is set, since we want to keep processing the same slot if we are not
    // running against actual time (eg when we use sandbox-style automining)
    if (
      this.lastSlotForCheckpointProposalJob &&
      this.lastSlotForCheckpointProposalJob >= slot &&
      this.config.enforceTimeTable
    ) {
      this.log.trace(`Slot ${slot} has already been processed`);
      return undefined;
    }

    // But if we have already proposed for this slot, the we definitely have to skip it, automining or not
    if (this.lastCheckpointProposed && this.lastCheckpointProposed.header.slotNumber >= slot) {
      this.log.trace(`Slot ${slot} has already been published as checkpoint ${this.lastCheckpointProposed.number}`);
      return undefined;
    }

    // Check all components are synced to latest as seen by the archiver (queries all subsystems)
    const syncedTo = await this.checkSync({ ts, slot });
    if (!syncedTo) {
      await this.tryVoteWhenSyncFails({ slot, ts });
      return undefined;
    }

    // If escape hatch is open for this epoch, do not start checkpoint proposal work and do not attempt invalidations.
    // Still perform governance/slashing voting (as proposer) once per slot.
    const isEscapeHatchOpen = await this.epochCache.isEscapeHatchOpen(epoch);

    if (isEscapeHatchOpen) {
      this.setState(SequencerState.PROPOSER_CHECK, slot);
      const [canPropose, proposer] = await this.checkCanPropose(slot);
      if (canPropose) {
        await this.tryVoteWhenEscapeHatchOpen({ slot, proposer });
      } else {
        this.log.trace(`Escape hatch open but we are not proposer, skipping vote-only actions`, {
          slot,
          epoch,
          proposer,
        });
      }
      return undefined;
    }

    // Next checkpoint follows from the last synced one
    const checkpointNumber = CheckpointNumber(syncedTo.checkpointNumber + 1);

    const logCtx = {
      now,
      syncedToL1Ts: syncedTo.l1Timestamp,
      syncedToL2Slot: getSlotAtTimestamp(syncedTo.l1Timestamp, this.l1Constants),
      slot,
      slotTs: ts,
      checkpointNumber,
      isPendingChainValid: pick(syncedTo.pendingChainValidationStatus, 'valid', 'reason', 'invalidIndex'),
    };

    // Check that we are a proposer for the next slot
    this.setState(SequencerState.PROPOSER_CHECK, slot);
    const [canPropose, proposer] = await this.checkCanPropose(slot);

    // If we are not a proposer check if we should invalidate an invalid checkpoint, and bail
    if (!canPropose) {
      await this.considerInvalidatingCheckpoint(syncedTo, slot);
      return undefined;
    }

    // Check that the slot is not taken by a block already (should never happen, since only us can propose for this slot)
    if (syncedTo.block && syncedTo.block.header.getSlot() >= slot) {
      this.log.warn(
        `Cannot propose block at next L2 slot ${slot} since that slot was taken by block ${syncedTo.blockNumber}`,
        { ...logCtx, block: syncedTo.block.header.toInspect() },
      );
      this.metrics.recordBlockProposalPrecheckFailed('slot_already_taken');
      return undefined;
    }

    // We now need to get ourselves a publisher.
    // The returned attestor will be the one we provided if we provided one.
    // Otherwise it will be a valid attestor for the returned publisher.
    // In fisherman mode, pass undefined to use the fisherman's own keystore instead of the actual proposer's
    const proposerForPublisher = this.config.fishermanMode ? undefined : proposer;
    const { attestorAddress, publisher } = await this.publisherFactory.create(proposerForPublisher);
    this.log.verbose(`Created publisher at address ${publisher.getSenderAddress()} for attestor ${attestorAddress}`);
    this.publisher = publisher;

    // In fisherman mode, set the actual proposer's address for simulations
    if (this.config.fishermanMode && proposer) {
      publisher.setProposerAddressForSimulation(proposer);
      this.log.debug(`Set proposer address ${proposer} for simulation in fisherman mode`);
    }

    // Prepare invalidation request if the pending chain is invalid (returns undefined if no need)
    const invalidateCheckpoint = await publisher.simulateInvalidateCheckpoint(syncedTo.pendingChainValidationStatus);

    // Check with the rollup contract if we can indeed propose at the next L2 slot. This check should not fail
    // if all the previous checks are good, but we do it just in case.
    const canProposeCheck = await publisher.canProposeAtNextEthBlock(
      syncedTo.archive,
      proposer ?? EthAddress.ZERO,
      invalidateCheckpoint,
    );

    if (canProposeCheck === undefined) {
      this.log.warn(
        `Cannot propose checkpoint ${checkpointNumber} at slot ${slot} due to failed rollup contract check`,
        logCtx,
      );
      this.emit('proposer-rollup-check-failed', { reason: 'Rollup contract check failed', slot });
      this.metrics.recordBlockProposalPrecheckFailed('rollup_contract_check_failed');
      return undefined;
    }

    if (canProposeCheck.slot !== slot) {
      this.log.warn(
        `Cannot propose block due to slot mismatch with rollup contract (this can be caused by a clock out of sync). Expected slot ${slot} but got ${canProposeCheck.slot}.`,
        { ...logCtx, rollup: canProposeCheck, expectedSlot: slot },
      );
      this.emit('proposer-rollup-check-failed', { reason: 'Slot mismatch', slot });
      this.metrics.recordBlockProposalPrecheckFailed('slot_mismatch');
      return undefined;
    }

    if (canProposeCheck.checkpointNumber !== checkpointNumber) {
      this.log.warn(
        `Cannot propose due to block mismatch with rollup contract (this can be caused by a pending archiver sync). Expected checkpoint ${checkpointNumber} but got ${canProposeCheck.checkpointNumber}.`,
        { ...logCtx, rollup: canProposeCheck, expectedSlot: slot },
      );
      this.emit('proposer-rollup-check-failed', { reason: 'Block mismatch', slot });
      this.metrics.recordBlockProposalPrecheckFailed('block_number_mismatch');
      return undefined;
    }

    this.lastSlotForCheckpointProposalJob = slot;
    await this.p2pClient.prepareForSlot(slot);
    this.log.info(`Preparing checkpoint proposal ${checkpointNumber} at slot ${slot}`, { ...logCtx, proposer });

    // Create and return the checkpoint proposal job
    return this.createCheckpointProposalJob(
      epoch,
      slot,
      checkpointNumber,
      syncedTo.blockNumber,
      proposer,
      publisher,
      attestorAddress,
      invalidateCheckpoint,
    );
  }

  protected createCheckpointProposalJob(
    epoch: EpochNumber,
    slot: SlotNumber,
    checkpointNumber: CheckpointNumber,
    syncedToBlockNumber: BlockNumber,
    proposer: EthAddress | undefined,
    publisher: SequencerPublisher,
    attestorAddress: EthAddress,
    invalidateCheckpoint: InvalidateCheckpointRequest | undefined,
  ): CheckpointProposalJob {
    return new CheckpointProposalJob(
      epoch,
      slot,
      checkpointNumber,
      syncedToBlockNumber,
      proposer,
      publisher,
      attestorAddress,
      invalidateCheckpoint,
      this.validatorClient,
      this.globalsBuilder,
      this.p2pClient,
      this.worldState,
      this.l1ToL2MessageSource,
      this.l2BlockSource,
      this.checkpointsBuilder,
      this.l2BlockSource,
      this.l1Constants,
      this.config,
      this.timetable,
      this.slasherClient,
      this.epochCache,
      this.dateProvider,
      this.metrics,
      this,
      this.setState.bind(this),
      this.tracer,
      this.log.getBindings(),
    );
  }

  /**
   * Internal helper for setting the sequencer state and checks if we have enough time left in the slot to transition to the new state.
   * @param proposedState - The new state to transition to.
   * @param slotNumber - The current slot number.
   * @param force - Whether to force the transition even if the sequencer is stopped.
   */
  protected setState(
    proposedState: SequencerState,
    slotNumber: SlotNumber | undefined,
    opts: { force?: boolean } = {},
  ): void {
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
      slot: slotNumber,
    });
    this.state = proposedState;
  }

  /**
   * Returns whether all dependencies have caught up.
   * We don't check against the previous block submitted since it may have been reorg'd out.
   */
  protected async checkSync(args: { ts: bigint; slot: SlotNumber }): Promise<SequencerSyncCheckResult | undefined> {
    // Check that the archiver and dependencies have synced to the previous L1 slot at least
    // TODO(#14766): Archiver reports L1 timestamp based on L1 blocks seen, which means that a missed L1 block will
    // cause the archiver L1 timestamp to fall behind, and cause this sequencer to start processing one L1 slot later.
    const l1Timestamp = await this.l2BlockSource.getL1Timestamp();
    const { slot, ts } = args;
    if (l1Timestamp === undefined || l1Timestamp + BigInt(this.l1Constants.ethereumSlotDuration) < ts) {
      this.log.debug(`Cannot propose block at next L2 slot ${slot} due to pending sync from L1`, {
        slot,
        ts,
        l1Timestamp,
      });
      return undefined;
    }

    const syncedBlocks = await Promise.all([
      this.worldState.status().then(({ syncSummary }) => ({
        number: syncSummary.latestBlockNumber,
        hash: syncSummary.latestBlockHash,
      })),
      this.l2BlockSource.getL2Tips().then(t => t.proposed),
      this.p2pClient.getStatus().then(p2p => p2p.syncedToL2Block),
      this.l1ToL2MessageSource.getL2Tips().then(t => t.proposed),
      this.l2BlockSource.getPendingChainValidationStatus(),
    ] as const);

    const [worldState, l2BlockSource, p2p, l1ToL2MessageSource, pendingChainValidationStatus] = syncedBlocks;

    // Handle zero as a special case, since the block hash won't match across services if we're changing the prefilled data for the genesis block,
    // as the world state can compute the new genesis block hash, but other components use the hardcoded constant.
    // TODO(palla/mbps): Fix the above. All components should be able to handle dynamic genesis block hashes.
    const result =
      (l2BlockSource.number === 0 && worldState.number === 0 && p2p.number === 0 && l1ToL2MessageSource.number === 0) ||
      (worldState.hash === l2BlockSource.hash &&
        p2p.hash === l2BlockSource.hash &&
        l1ToL2MessageSource.hash === l2BlockSource.hash);

    if (!result) {
      this.log.debug(`Sequencer sync check failed`, { worldState, l2BlockSource, p2p, l1ToL2MessageSource });
      return undefined;
    }

    // Special case for genesis state
    const blockNumber = worldState.number;
    if (blockNumber < INITIAL_L2_BLOCK_NUM) {
      const archive = new Fr((await this.worldState.getCommitted().getTreeInfo(MerkleTreeId.ARCHIVE)).root);
      return {
        checkpointNumber: CheckpointNumber.ZERO,
        blockNumber: BlockNumber.ZERO,
        archive,
        l1Timestamp,
        pendingChainValidationStatus,
      };
    }

    const block = await this.l2BlockSource.getL2Block(blockNumber);
    if (!block) {
      // this shouldn't really happen because a moment ago we checked that all components were in sync
      this.log.error(`Failed to get L2 block ${blockNumber} from the archiver with all components in sync`);
      return undefined;
    }

    return {
      block,
      blockNumber: block.number,
      checkpointNumber: block.checkpointNumber,
      archive: block.archive.root,
      l1Timestamp,
      pendingChainValidationStatus,
    };
  }

  /**
   * Checks if we are the proposer for the next slot.
   * @returns True if we can propose, and the proposer address (undefined if anyone can propose)
   */
  protected async checkCanPropose(slot: SlotNumber): Promise<[boolean, EthAddress | undefined]> {
    let proposer: EthAddress | undefined;

    try {
      proposer = await this.epochCache.getProposerAttesterAddressInSlot(slot);
    } catch (e) {
      if (e instanceof NoCommitteeError) {
        if (this.lastSlotForNoCommitteeWarning !== slot) {
          this.lastSlotForNoCommitteeWarning = slot;
          this.log.warn(`Cannot propose at next L2 slot ${slot} since the committee does not exist on L1`);
        }
        return [false, undefined];
      }
      this.log.error(`Error getting proposer for slot ${slot}`, e);
      return [false, undefined];
    }

    // If proposer is undefined, then the committee is empty and anyone may propose
    if (proposer === undefined) {
      return [true, undefined];
    }
    // In fisherman mode, just return the current proposer
    if (this.config.fishermanMode) {
      return [true, proposer];
    }

    const validatorAddresses = this.validatorClient.getValidatorAddresses();
    const weAreProposer = validatorAddresses.some(addr => addr.equals(proposer));

    if (!weAreProposer) {
      this.log.debug(`Cannot propose at slot ${slot} since we are not a proposer`, { validatorAddresses, proposer });
      return [false, proposer];
    }

    return [true, proposer];
  }

  /**
   * Tries to vote on slashing actions and governance when the sync check fails but we're past the max time for initializing a proposal.
   * This allows the sequencer to participate in governance/slashing votes even when it cannot build blocks.
   */
  @trackSpan('Seqeuencer.tryVoteWhenSyncFails', ({ slot }) => ({ [Attributes.SLOT_NUMBER]: slot }))
  protected async tryVoteWhenSyncFails(args: { slot: SlotNumber; ts: bigint }): Promise<void> {
    const { slot } = args;

    // Prevent duplicate attempts in the same slot
    if (this.lastSlotForFallbackVote === slot) {
      this.log.trace(`Already attempted to vote in slot ${slot} (skipping)`);
      return;
    }

    // Check if we're past the max time for initializing a proposal
    const secondsIntoSlot = this.getSecondsIntoSlot(slot);
    const maxAllowedTime = this.timetable.getMaxAllowedTime(SequencerState.INITIALIZING_CHECKPOINT);

    // If we haven't exceeded the time limit for initializing a proposal, don't proceed with voting
    // We use INITIALIZING_PROPOSAL time limit because if we're past that, we can't build a block anyway
    if (maxAllowedTime === undefined || secondsIntoSlot <= maxAllowedTime) {
      this.log.trace(`Not attempting to vote since there is still time for block building`, {
        secondsIntoSlot,
        maxAllowedTime,
      });
      return;
    }

    this.log.trace(`Sync for slot ${slot} failed, checking for voting opportunities`, {
      secondsIntoSlot,
      maxAllowedTime,
    });

    // Check if we're a proposer or proposal is open
    const [canPropose, proposer] = await this.checkCanPropose(slot);
    if (!canPropose) {
      this.log.trace(`Cannot vote in slot ${slot} since we are not a proposer`, { slot, proposer });
      return;
    }

    // Mark this slot as attempted
    this.lastSlotForFallbackVote = slot;

    // Get a publisher for voting
    const { attestorAddress, publisher } = await this.publisherFactory.create(proposer);

    this.log.debug(`Attempting to vote despite sync failure at slot ${slot}`, {
      attestorAddress,
      slot,
    });

    // Enqueue governance and slashing votes
    const voter = new CheckpointVoter(
      slot,
      publisher,
      attestorAddress,
      this.validatorClient,
      this.slasherClient,
      this.l1Constants,
      this.config,
      this.metrics,
      this.log,
    );
    const votesPromises = voter.enqueueVotes();
    const votes = await Promise.all(votesPromises);

    if (votes.every(p => !p)) {
      this.log.debug(`No votes to enqueue for slot ${slot}`);
      return;
    }

    this.log.info(`Voting in slot ${slot} despite sync failure`, { slot });
    await publisher.sendRequests();
  }

  /**
   * Tries to vote on slashing actions and governance proposals when escape hatch is open.
   * This allows the sequencer to participate in voting without performing checkpoint proposal work.
   */
  @trackSpan('Sequencer.tryVoteWhenEscapeHatchOpen', ({ slot }) => ({ [Attributes.SLOT_NUMBER]: slot }))
  protected async tryVoteWhenEscapeHatchOpen(args: {
    slot: SlotNumber;
    proposer: EthAddress | undefined;
  }): Promise<void> {
    const { slot, proposer } = args;

    // Prevent duplicate attempts in the same slot
    if (this.lastSlotForFallbackVote === slot) {
      this.log.trace(`Already attempted to vote in slot ${slot} (escape hatch open, skipping)`);
      return;
    }

    // Mark this slot as attempted
    this.lastSlotForFallbackVote = slot;

    const { attestorAddress, publisher } = await this.publisherFactory.create(proposer);

    this.log.debug(`Escape hatch open for slot ${slot}, attempting vote-only actions`, { slot, attestorAddress });

    const voter = new CheckpointVoter(
      slot,
      publisher,
      attestorAddress,
      this.validatorClient,
      this.slasherClient,
      this.l1Constants,
      this.config,
      this.metrics,
      this.log,
    );

    const votesPromises = voter.enqueueVotes();
    const votes = await Promise.all(votesPromises);

    if (votes.every(p => !p)) {
      this.log.debug(`No votes to enqueue for slot ${slot} (escape hatch open)`);
      return;
    }

    this.log.info(`Voting in slot ${slot} (escape hatch open)`, { slot });
    await publisher.sendRequests();
  }

  /**
   * Considers invalidating a block if the pending chain is invalid. Depends on how long the invalid block
   * has been there without being invalidated and whether the sequencer is in the committee or not. We always
   * have the proposer try to invalidate, but if they fail, the sequencers in the committee are expected to try,
   * and if they fail, any sequencer will try as well.
   */
  protected async considerInvalidatingCheckpoint(
    syncedTo: SequencerSyncCheckResult,
    currentSlot: SlotNumber,
  ): Promise<void> {
    const { pendingChainValidationStatus, l1Timestamp } = syncedTo;
    if (pendingChainValidationStatus.valid) {
      return;
    }

    const invalidCheckpointNumber = pendingChainValidationStatus.checkpoint.checkpointNumber;
    const invalidCheckpointTimestamp = pendingChainValidationStatus.checkpoint.timestamp;
    const timeSinceChainInvalid = this.dateProvider.nowInSeconds() - Number(invalidCheckpointTimestamp);
    const ourValidatorAddresses = this.validatorClient.getValidatorAddresses();

    const { secondsBeforeInvalidatingBlockAsCommitteeMember, secondsBeforeInvalidatingBlockAsNonCommitteeMember } =
      this.config;

    const logData = {
      invalidL1Timestamp: invalidCheckpointTimestamp,
      l1Timestamp,
      invalidCheckpoint: pendingChainValidationStatus.checkpoint,
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

    let validatorToUse: EthAddress;
    if (invalidateAsCommitteeMember) {
      // When invalidating as a committee member, use first validator that's actually in the committee
      const { committee } = await this.epochCache.getCommittee(currentSlot);
      if (committee) {
        const committeeSet = new Set(committee.map(addr => addr.toString()));
        validatorToUse =
          ourValidatorAddresses.find(addr => committeeSet.has(addr.toString())) ?? ourValidatorAddresses[0];
      } else {
        validatorToUse = ourValidatorAddresses[0];
      }
    } else {
      // When invalidating as a non-committee member, use the first validator
      validatorToUse = ourValidatorAddresses[0];
    }

    const { publisher } = await this.publisherFactory.create(validatorToUse);

    const invalidateCheckpoint = await publisher.simulateInvalidateCheckpoint(pendingChainValidationStatus);
    if (!invalidateCheckpoint) {
      this.log.warn(`Failed to simulate invalidate checkpoint`, logData);
      return;
    }

    this.log.info(
      invalidateAsCommitteeMember
        ? `Invalidating checkpoint ${invalidCheckpointNumber} as committee member`
        : `Invalidating checkpoint ${invalidCheckpointNumber} as non-committee member`,
      logData,
    );

    publisher.enqueueInvalidateCheckpoint(invalidateCheckpoint);

    if (!this.config.fishermanMode) {
      await publisher.sendRequests();
    } else {
      this.log.info('Invalidating checkpoint in fisherman mode, clearing pending requests');
      publisher.clearPendingRequests();
    }
  }

  private logStrategyComparison(epoch: EpochNumber, publisher: SequencerPublisher): void {
    const feeAnalyzer = publisher.getL1FeeAnalyzer();
    if (!feeAnalyzer) {
      return;
    }

    const comparison = feeAnalyzer.getStrategyComparison();
    if (comparison.length === 0) {
      this.log.debug(`No strategy data available yet for epoch ${epoch}`);
      return;
    }

    this.log.info(`L1 Fee Strategy Performance Report - End of Epoch ${epoch}`, {
      epoch: Number(epoch),
      totalAnalyses: comparison[0]?.totalAnalyses,
      strategies: comparison.map(s => ({
        id: s.strategyId,
        name: s.strategyName,
        inclusionRate: `${(s.inclusionRate * 100).toFixed(1)}%`,
        inclusionCount: `${s.inclusionCount}/${s.totalAnalyses}`,
        avgCostEth: s.avgEstimatedCostEth.toFixed(6),
        totalCostEth: s.totalEstimatedCostEth.toFixed(6),
        avgOverpaymentEth: s.avgOverpaymentEth.toFixed(6),
        totalOverpaymentEth: s.totalOverpaymentEth.toFixed(6),
        avgPriorityFeeDeltaGwei: s.avgPriorityFeeDeltaGwei.toFixed(2),
      })),
    });
  }

  private getSlotStartBuildTimestamp(slotNumber: SlotNumber): number {
    return getSlotStartBuildTimestamp(slotNumber, this.l1Constants);
  }

  private getSecondsIntoSlot(slotNumber: SlotNumber): number {
    const slotStartTimestamp = this.getSlotStartBuildTimestamp(slotNumber);
    return Number((this.dateProvider.now() / 1000 - slotStartTimestamp).toFixed(3));
  }

  public get aztecSlotDuration() {
    return this.l1Constants.slotDuration;
  }

  public get maxL2BlockGas(): number | undefined {
    return this.config.maxL2BlockGas;
  }

  public getSlasherClient(): SlasherClientInterface | undefined {
    return this.slasherClient;
  }

  public get tracer(): Tracer {
    return this.metrics.tracer;
  }

  public getValidatorAddresses() {
    return this.validatorClient?.getValidatorAddresses();
  }

  public getConfig() {
    return this.config;
  }

  private get l1PublishingTime(): number {
    return this.config.l1PublishingTime ?? this.l1Constants.ethereumSlotDuration;
  }
}

type SequencerSyncCheckResult = {
  block?: L2Block;
  checkpointNumber: CheckpointNumber;
  blockNumber: BlockNumber;
  archive: Fr;
  l1Timestamp: bigint;
  pendingChainValidationStatus: ValidateCheckpointResult;
};
