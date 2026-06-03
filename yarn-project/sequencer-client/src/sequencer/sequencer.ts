import { getKzg } from '@aztec/blob-lib';
import { type EpochCache, PROPOSER_PIPELINING_SLOT_OFFSET } from '@aztec/epoch-cache';
import { NoCommitteeError, type RollupContract } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { merge, omit, pick } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import type { DateProvider } from '@aztec/foundation/timer';
import type { TypedEventEmitter } from '@aztec/foundation/types';
import type { P2P } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import type {
  BlockData,
  L2BlockSink,
  L2BlockSource,
  ProposedCheckpointSink,
  ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import type { Checkpoint, ProposedCheckpointData } from '@aztec/stdlib/checkpoint';
import type { ChainConfig } from '@aztec/stdlib/config';
import { getEpochAtSlot, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import {
  type ResolvedSequencerConfig,
  type SequencerConfig,
  SequencerConfigSchema,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import { pickFromSchema } from '@aztec/stdlib/schemas';
import {
  DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME,
  DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
  DEFAULT_MIN_BLOCK_DURATION,
  DEFAULT_P2P_PROPAGATION_TIME,
  ProposerTimetable,
} from '@aztec/stdlib/timetable';
import { Attributes, type TelemetryClient, type Tracer, getTelemetryClient, trackSpan } from '@aztec/telemetry-client';
import { FullNodeCheckpointsBuilder, NodeKeystoreAdapter, type ValidatorClient } from '@aztec/validator-client';

import EventEmitter from 'node:events';

import { DefaultSequencerConfig } from '../config.js';
import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { SequencerPublisherFactory } from '../publisher/sequencer-publisher-factory.js';
import type { InvalidateCheckpointRequest, SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { buildCheckpointSimulationOverridesPlan } from './chain_state_overrides.js';
import { CheckpointProposalJob } from './checkpoint_proposal_job.js';
import { CheckpointProposalJobMetrics } from './checkpoint_proposal_job_metrics.js';
import { CheckpointVoter } from './checkpoint_voter.js';
import { SequencerInterruptedError } from './errors.js';
import type { SequencerEvents } from './events.js';
import { SequencerMetrics } from './metrics.js';
import type { SequencerRollupConstants } from './types.js';
import { SequencerState } from './utils.js';

export { SequencerState };

/** Slot snapshot used to prepare a checkpoint proposal. */
type SequencerSlotContext = {
  slot: SlotNumber;
  targetSlot: SlotNumber;
  epoch: EpochNumber;
  targetEpoch: EpochNumber;
  ts: bigint;
  nowSeconds: bigint;
};

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
  private stateSlotNumber: SlotNumber | undefined;
  /** Wall-clock time (ms, via the date provider) at which the current state was entered. */
  private stateEnteredAtMs: number;
  private metrics: SequencerMetrics;
  private checkpointProposalJobMetrics: CheckpointProposalJobMetrics;
  private readonly stateLog: Logger;

  /** The last slot for which we attempted to perform our voting duties with degraded block production */
  private lastSlotForFallbackVote: SlotNumber | undefined;

  /** The last slot for which we logged "no committee" warning, to avoid spam */
  private lastSlotForNoCommitteeWarning: SlotNumber | undefined;

  /** The last slot for which we triggered a checkpoint proposal job, to prevent duplicate attempts. */
  protected lastSlotForCheckpointProposalJob: SlotNumber | undefined;

  /** Last successful checkpoint proposed */
  private lastCheckpointProposed: Checkpoint | undefined;

  /** The last epoch for which we logged strategy comparison in fisherman mode. */
  private lastEpochForStrategyComparison: EpochNumber | undefined;

  /** The last checkpoint proposal job, tracked so we can await its pending L1 submission during shutdown. */
  protected lastCheckpointProposalJob: CheckpointProposalJob | undefined;

  /** Proposer schedule and block sub-slot timetable for the sequencer, rebuilt on every config update. */
  protected timetable!: ProposerTimetable;

  /** Config for the sequencer */
  protected config: ResolvedSequencerConfig = DefaultSequencerConfig;
  private readonly signatureContext: CoordinationSignatureContext;

  constructor(
    protected publisherFactory: SequencerPublisherFactory,
    protected validatorClient: ValidatorClient,
    protected globalsBuilder: GlobalVariableBuilder,
    protected p2pClient: P2P,
    protected worldState: WorldStateSynchronizer,
    protected slasherClient: SlasherClientInterface | undefined,
    protected l2BlockSource: L2BlockSource & L2BlockSink & ProposedCheckpointSink,
    protected l1ToL2MessageSource: L1ToL2MessageSource,
    protected checkpointsBuilder: FullNodeCheckpointsBuilder,
    protected l1Constants: SequencerRollupConstants,
    protected dateProvider: DateProvider,
    protected epochCache: EpochCache,
    protected rollupContract: RollupContract,
    config: SequencerConfig & Pick<ChainConfig, 'l1ChainId' | 'rollupAddress'>,
    protected telemetry: TelemetryClient = getTelemetryClient(),
    protected log = createLogger('sequencer'),
  ) {
    super();
    this.stateLog = log.createChild('state');
    this.stateEnteredAtMs = this.dateProvider.now();

    // Add [FISHERMAN] prefix to logger if in fisherman mode
    if (config.fishermanMode) {
      this.log = log.createChild('[FISHERMAN]');
    }

    this.signatureContext = {
      chainId: config.l1ChainId,
      rollupAddress: config.rollupAddress,
    };
    this.metrics = new SequencerMetrics(telemetry, this.rollupContract, 'Sequencer');
    this.checkpointProposalJobMetrics = new CheckpointProposalJobMetrics(telemetry);
    this.updateConfig(config);
  }

  /** Updates sequencer config by the defined values and updates the timetable */
  public updateConfig(config: Partial<SequencerConfig>) {
    const filteredConfig = pickFromSchema(config, SequencerConfigSchema);
    this.log.info(`Updated sequencer config`, omit(filteredConfig, 'txPublicSetupAllowListExtend'));
    this.config = merge(this.config, filteredConfig);
    this.timetable = this.buildTimetable();
  }

  /**
   * Builds the proposer timetable from the current config and L1 constants. The fast local/e2e profile and
   * budget clamping happen inside {@link ProposerTimetable}; here we only fill the operational budgets the
   * config leaves unset with the shared `DEFAULT_*` values (the config layer owns the defaults).
   */
  private buildTimetable(): ProposerTimetable {
    const timetable = new ProposerTimetable({
      l1Constants: this.l1Constants,
      blockDuration: this.config.blockDurationMs !== undefined ? this.config.blockDurationMs / 1000 : undefined,
      minBlockDuration: this.config.minBlockDuration ?? DEFAULT_MIN_BLOCK_DURATION,
      p2pPropagationTime: this.config.attestationPropagationTime ?? DEFAULT_P2P_PROPAGATION_TIME,
      checkpointProposalPrepareTime:
        this.config.checkpointProposalPrepareTime ?? DEFAULT_CHECKPOINT_PROPOSAL_PREPARE_TIME,
      checkpointProposalInitTime: DEFAULT_CHECKPOINT_PROPOSAL_INIT_TIME,
      enforce: this.config.enforceTimeTable,
    });

    const maxNumberOfBlocks = timetable.getMaxBlocksPerCheckpoint();
    this.log.info(
      `Sequencer timetable initialized with ${maxNumberOfBlocks} blocks per slot (${timetable.enforce ? 'enforced' : 'not enforced'})`,
      {
        aztecSlotDuration: timetable.aztecSlotDuration,
        ethereumSlotDuration: timetable.ethereumSlotDuration,
        blockDuration: timetable.blockDuration,
        minBlockDuration: timetable.minBlockDuration,
        p2pPropagationTime: timetable.p2pPropagationTime,
        checkpointProposalPrepareTime: timetable.checkpointProposalPrepareTime,
        maxNumberOfBlocks,
        enforce: timetable.enforce,
      },
    );

    if (maxNumberOfBlocks < 1) {
      throw new Error(
        `Invalid timing configuration: derived ${maxNumberOfBlocks} blocks per checkpoint for slot duration ` +
          `${timetable.aztecSlotDuration}s and block duration ${timetable.blockDuration}s.`,
      );
    }

    return timetable;
  }

  /** Initializes the sequencer (precomputes tables). Takes about 3s. */
  public init() {
    getKzg();
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

  /** Triggers an immediate run of the sequencer, bypassing the polling interval. */
  public trigger() {
    return this.runningPromise?.trigger();
  }

  /** Stops the sequencer from building blocks and moves to STOPPED state. */
  public async stop(): Promise<void> {
    this.log.info(`Stopping sequencer`);
    this.setState(SequencerState.STOPPING, undefined, { force: true });
    await this.publisherFactory.stopAll();
    await this.runningPromise?.stop();
    await this.lastCheckpointProposalJob?.awaitPendingSubmission();
    this.setState(SequencerState.STOPPED, undefined, { force: true });
    this.log.info('Stopped sequencer');
  }

  /** Main sequencer loop with a try/catch */
  protected async safeWork() {
    try {
      await this.work();
    } catch (err) {
      this.emit('checkpoint-error', { error: err as Error });
      throw err;
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
    const { slot, targetSlot, epoch, targetEpoch, ts, nowSeconds } = this.getSlotContextInNextL1Slot();

    // Check if we are synced and it's our slot, grab a publisher, check previous block invalidation, etc
    const checkpointProposalJob = await this.prepareCheckpointProposal(
      slot,
      targetSlot,
      epoch,
      targetEpoch,
      ts,
      nowSeconds,
    );
    if (!checkpointProposalJob) {
      return;
    }

    // Track the job so we can await its pending L1 submission during shutdown
    this.lastCheckpointProposalJob = checkpointProposalJob;

    // Execute the checkpoint proposal job
    const checkpoint = await checkpointProposalJob.execute();

    // Update last checkpoint proposed (currently unused)
    if (checkpoint) {
      this.lastCheckpointProposed = checkpoint;
    }

    // Log fee strategy comparison if on fisherman (uses target epoch since we mirror the proposer's perspective)
    if (
      this.config.fishermanMode &&
      (this.lastEpochForStrategyComparison === undefined || targetEpoch > this.lastEpochForStrategyComparison)
    ) {
      this.logStrategyComparison(targetEpoch, checkpointProposalJob.getPublisher());
      this.lastEpochForStrategyComparison = targetEpoch;
    }

    return checkpoint;
  }

  /** Returns slot and target slot from a single clock snapshot. */
  protected getSlotContextInNextL1Slot(): SequencerSlotContext {
    const { slot, ts, nowSeconds, epoch } = this.epochCache.getEpochAndSlotInNextL1Slot();
    const targetSlot = SlotNumber(slot + PROPOSER_PIPELINING_SLOT_OFFSET);
    return { slot, targetSlot, epoch, targetEpoch: getEpochAtSlot(targetSlot, this.l1Constants), ts, nowSeconds };
  }

  /**
   * Prepares the checkpoint proposal by performing all necessary checks and setup.
   * This is the initial step in the main loop.
   * @returns CheckpointProposalJob if successful, undefined if we are not yet synced or are not the proposer.
   */
  @trackSpan('Sequencer.prepareCheckpointProposal')
  protected async prepareCheckpointProposal(
    slot: SlotNumber,
    targetSlot: SlotNumber,
    epoch: EpochNumber,
    targetEpoch: EpochNumber,
    ts: bigint,
    nowSeconds: bigint,
  ): Promise<CheckpointProposalJob | undefined> {
    // Check we have not already processed this target slot (cheapest check)
    // We only check this if enforce timetable is set, since we want to keep processing the same slot if we are not
    // running against actual time (eg when we use sandbox-style automining)
    if (
      this.lastSlotForCheckpointProposalJob &&
      this.lastSlotForCheckpointProposalJob >= targetSlot &&
      this.config.enforceTimeTable
    ) {
      this.log.trace(`Target slot ${targetSlot} has already been processed`);
      return undefined;
    }

    // But if we have already proposed for this slot, then we definitely have to skip it, automining or not
    if (this.lastCheckpointProposed && this.lastCheckpointProposed.header.slotNumber >= targetSlot) {
      this.log.trace(
        `Slot ${targetSlot} has already been published as checkpoint ${this.lastCheckpointProposed.number}`,
      );
      return undefined;
    }

    // Test-only: skip proposing for explicitly paused slots. Attestation paths run in the validator
    // client and are not gated by this hook, so paused proposers still attest to others' proposals.
    if (this.config.pauseProposingForSlots?.some(s => s === targetSlot)) {
      this.log.warn(`Skipping proposal for paused slot ${targetSlot} (test-only pauseProposingForSlots hook)`, {
        targetSlot,
      });
      return undefined;
    }

    // Check all components are synced to latest as seen by the archiver (queries all subsystems)
    const syncedTo = await this.checkSync({ ts, slot });
    if (!syncedTo) {
      await this.tryVoteWhenCannotBuild({ slot, targetSlot });
      return undefined;
    }

    // If escape hatch is open for the target epoch, do not start checkpoint proposal work and do not attempt invalidations.
    // Still perform governance/slashing voting (as proposer) once per slot.
    // When pipelining, we check the target epoch (slot+1's epoch) since that's the epoch we're building for.
    const isEscapeHatchOpen = await this.epochCache.isEscapeHatchOpen(targetEpoch);

    if (isEscapeHatchOpen) {
      this.setState(SequencerState.PROPOSER_CHECK, targetSlot);
      const [canPropose, proposer] = await this.checkCanPropose(targetSlot);
      if (canPropose) {
        await this.tryVoteWhenEscapeHatchOpen({ slot, targetSlot, proposer });
      } else {
        this.log.trace(`Escape hatch open but we are not proposer, skipping vote-only actions`, {
          slot,
          epoch,
          proposer,
        });
      }
      return undefined;
    }

    // Explicit build-loop entry gate (replaces the old getMaxAllowedTime(INITIALIZING_CHECKPOINT)
    // state gate that fired before the proposer check): if we are past the latest useful block-building
    // start for the target slot, abandon building for this slot before doing the proposer check. The
    // proposer prioritizes the ideal L1-publish path and does not plan around the late
    // consensus-handoff path. Vote-only paths still run when block building is abandoned.
    const startDeadline = this.timetable.getBuildStartDeadline(targetSlot);
    const nowForStartGate = this.dateProvider.now() / 1000;
    if (this.config.enforceTimeTable && nowForStartGate > startDeadline) {
      this.log.debug(`Past start deadline for slot ${targetSlot}, abandoning block building`, {
        targetSlot,
        nowForStartGate,
        startDeadline,
      });
      // Mark the slot as attempted so a deadline abort is not retried within the same slot. Vote-only actions
      // still need to run because sync can succeed even when it is too late to start building a checkpoint.
      await this.tryVoteWhenCannotBuild({ slot, targetSlot });
      this.lastSlotForCheckpointProposalJob = targetSlot;
      return undefined;
    }

    // Next checkpoint follows from the last synced one
    const checkpointNumber = CheckpointNumber(syncedTo.checkpointNumber + 1);

    const logCtx = {
      nowSeconds,
      syncedToL2Slot: syncedTo.syncedL2Slot,
      slot,
      targetSlot,
      slotTs: ts,
      checkpointNumber,
      isPendingChainValid: pick(syncedTo.pendingChainValidationStatus, 'valid', 'reason', 'invalidIndex'),
    };

    // Check that we are a proposer for the target slot.
    this.setState(SequencerState.PROPOSER_CHECK, targetSlot);
    const [canPropose, proposer] = await this.checkCanPropose(targetSlot);

    // If we are not a proposer check if we should invalidate an invalid checkpoint, and bail
    if (!canPropose) {
      await this.considerInvalidatingCheckpoint(syncedTo, slot);
      return undefined;
    }

    // Guard: don't exceed 1-deep pipeline. Without a proposed checkpoint, we can only build
    // confirmed + 1. With a proposed checkpoint, we can build confirmed + 2.
    const confirmedCkpt = syncedTo.checkpointedCheckpointNumber;
    if (checkpointNumber > confirmedCkpt + 2) {
      this.log.verbose(
        `Skipping slot ${targetSlot}: checkpoint ${checkpointNumber} exceeds max pipeline depth (confirmed=${confirmedCkpt})`,
      );
      return undefined;
    }

    // Check that the target slot is not taken by a block already (should never happen, since only us can propose for this slot)
    if (syncedTo.blockData && syncedTo.blockData.header.getSlot() >= targetSlot) {
      this.log.warn(
        `Cannot propose block at target slot ${targetSlot} since that slot was taken by block ${syncedTo.blockNumber}`,
        { ...logCtx, block: syncedTo.blockData.header.toInspect() },
      );
      this.metrics.recordCheckpointPrecheckFailed('slot_already_taken');
      return undefined;
    }

    // We now need to get ourselves a publisher.
    // The returned attestor will be the one we provided if we provided one.
    // Otherwise it will be a valid attestor for the returned publisher.
    // In fisherman mode, pass undefined to use the fisherman's own keystore instead of the actual proposer's
    const proposerForPublisher = this.config.fishermanMode ? undefined : proposer;
    const { attestorAddress, publisher } = await this.publisherFactory.create(proposerForPublisher);
    this.log.verbose(`Created publisher at address ${publisher.getSenderAddress()} for attestor ${attestorAddress}`);

    // Prepare invalidation request if the pending chain is invalid (returns undefined if no need).
    // Only simulate invalidation when there's no proposed parent, since we assume the proposed parent
    // will invalidate the currently invalid checkpoint on L1.
    const invalidateCheckpoint =
      syncedTo.hasProposedCheckpoint || syncedTo.pendingChainValidationStatus.valid
        ? undefined
        : await publisher.simulateInvalidateCheckpoint(syncedTo.pendingChainValidationStatus);

    // Determine the correct archive and L1 state overrides for the canProposeAt check.
    // The L1 contract reads archives[proposedCheckpointNumber] and compares it with the provided archive.
    // When invalidating or pipelining, the local archive may differ from L1's, so we adjust accordingly.
    let archiveForCheck = syncedTo.archive;

    if (syncedTo.hasProposedCheckpoint) {
      this.metrics.recordPipelineDepth(syncedTo.checkpointNumber - syncedTo.checkpointedCheckpointNumber);
      this.log.verbose(
        `Building on top of proposed checkpoint (pending=${syncedTo.proposedCheckpointData?.checkpointNumber}) for target slot ${targetSlot}`,
        { targetSlot, parentCheckpointNumber: CheckpointNumber(checkpointNumber - 1) },
      );
      // Match what L1 will see at archives[pending] once the proposed parent lands: the parent's
      // own archive root from the gossiped proposal. `syncedTo.archive` is the world-state-local
      // view and can transiently diverge from the proposed parent (e.g. before the proposed
      // parent's blocks have been applied locally); diverging here would cause the canProposeAt
      // override to set archives[pending] to one value while we present another for comparison.
      archiveForCheck = syncedTo.proposedCheckpointData!.archive.root;
    } else if (invalidateCheckpoint) {
      // After invalidation, L1 will roll back to checkpoint N-1. The archive at N-1 already
      // exists on L1, so we just pass the matching archive (the lastArchive of the invalid checkpoint).
      archiveForCheck = invalidateCheckpoint.lastArchive;
      this.metrics.recordPipelineDepth(0);
    } else {
      this.metrics.recordPipelineDepth(0);
    }

    // Build the simulation plan: pending/proven override from pipelining or invalidation (or the
    // current snapshot when neither applies, to short-circuit any pending prune in simulation),
    // plus the parent checkpoint cell and fee header when pipelining.
    const simulationOverridesPlan = await buildCheckpointSimulationOverridesPlan({
      checkpointNumber,
      proposedCheckpointData: syncedTo.hasProposedCheckpoint ? syncedTo.proposedCheckpointData : undefined,
      invalidateToPendingCheckpointNumber: invalidateCheckpoint?.forcePendingCheckpointNumber,
      checkpointedCheckpointNumber: syncedTo.checkpointedCheckpointNumber,
      rollup: this.rollupContract,
      signatureContext: this.signatureContext,
      log: this.log,
    });

    // The plan always pins both pending/proven (to short-circuit `canPruneAtTime` in simulation),
    // so `provenOverride` always reflects the assumed proven checkpoint we are pinning the
    // simulation to. We additionally warn when the pin is load-bearing — i.e. when a prune would
    // actually fire at the target slot without it — so observers can spot "we are building
    // optimistically across a pruning boundary" in the logs.
    const provenOverride = simulationOverridesPlan?.chainTipsOverride?.proven;
    if (provenOverride !== undefined && (await this.l2BlockSource.isPruneDueAtSlot(targetSlot))) {
      this.log.warn(
        `Assuming proof for epoch ending at checkpoint ${provenOverride} lands by target slot ${targetSlot}`,
        { checkpointNumber, slot, targetSlot, provenOverride },
      );
    }

    this.emit('preparing-checkpoint', {
      targetSlot,
      checkpointNumber,
      hadProposedParent: syncedTo.hasProposedCheckpoint,
      provenOverride,
      simulatedPending: simulationOverridesPlan?.chainTipsOverride?.pending,
    });

    const canProposeCheck = await publisher.canProposeAt(
      archiveForCheck,
      proposer ?? EthAddress.ZERO,
      simulationOverridesPlan,
    );

    const proposeContext = {
      hasProposedCheckpoint: syncedTo.hasProposedCheckpoint,
      proposedCheckpointNumber: syncedTo.proposedCheckpointData?.checkpointNumber,
      checkpointedCheckpointNumber: syncedTo.checkpointedCheckpointNumber,
      isInvalidating: !!invalidateCheckpoint,
      invalidatingCheckpointNumber: invalidateCheckpoint?.checkpointNumber,
      archiveForCheck: archiveForCheck.toString(),
      overridePendingCheckpointNumber: simulationOverridesPlan?.chainTipsOverride?.pending,
      overrideArchive: simulationOverridesPlan?.pendingCheckpointState?.archive,
      overrideFeeHeader: simulationOverridesPlan?.pendingCheckpointState?.feeHeader,
    };

    if (canProposeCheck === undefined) {
      this.log.warn(
        `Cannot propose checkpoint ${checkpointNumber} at slot ${slot} due to failed rollup contract check`,
        { ...logCtx, ...proposeContext },
      );
      this.emit('proposer-rollup-check-failed', { reason: 'Rollup contract check failed', slot });
      this.metrics.recordCheckpointPrecheckFailed('rollup_contract_check_failed');
      return undefined;
    }

    if (canProposeCheck.slot !== targetSlot) {
      this.log.warn(
        `Cannot propose block due to slot mismatch with rollup contract (this can be caused by a clock out of sync). Expected slot ${targetSlot} but got ${canProposeCheck.slot}.`,
        { ...logCtx, ...proposeContext, rollup: canProposeCheck, expectedSlot: targetSlot },
      );
      this.emit('proposer-rollup-check-failed', { reason: 'Slot mismatch', slot });
      this.metrics.recordCheckpointPrecheckFailed('slot_mismatch');
      return undefined;
    }

    if (canProposeCheck.checkpointNumber !== checkpointNumber) {
      this.log.warn(
        `Cannot propose due to block mismatch with rollup contract (this can be caused by a pending archiver sync). Expected checkpoint ${checkpointNumber} but got ${canProposeCheck.checkpointNumber}.`,
        { ...logCtx, ...proposeContext, rollup: canProposeCheck, expectedSlot: slot },
      );
      this.emit('proposer-rollup-check-failed', { reason: 'Block mismatch', slot });
      this.metrics.recordCheckpointPrecheckFailed('block_number_mismatch');
      return undefined;
    }

    this.lastSlotForCheckpointProposalJob = targetSlot;

    await this.p2pClient.prepareForSlot(targetSlot);
    this.log.info(
      `Preparing checkpoint proposal ${checkpointNumber} for target slot ${targetSlot} during wall-clock slot ${slot}`,
      {
        ...logCtx,
        ...proposeContext,
        proposer,
      },
    );

    // Create and return the checkpoint proposal job
    return this.createCheckpointProposalJob(
      slot,
      targetSlot,
      targetEpoch,
      checkpointNumber,
      syncedTo.blockNumber,
      syncedTo.checkpointedCheckpointNumber,
      proposer,
      publisher,
      attestorAddress,
      invalidateCheckpoint,
      syncedTo.proposedCheckpointData,
    );
  }

  protected createCheckpointProposalJob(
    slot: SlotNumber,
    targetSlot: SlotNumber,
    targetEpoch: EpochNumber,
    checkpointNumber: CheckpointNumber,
    syncedToBlockNumber: BlockNumber,
    checkpointedCheckpointNumber: CheckpointNumber,
    proposer: EthAddress | undefined,
    publisher: SequencerPublisher,
    attestorAddress: EthAddress,
    invalidateCheckpoint: InvalidateCheckpointRequest | undefined,
    proposedCheckpointData?: ProposedCheckpointData,
  ): CheckpointProposalJob {
    return new CheckpointProposalJob(
      slot,
      targetSlot,
      targetEpoch,
      checkpointNumber,
      syncedToBlockNumber,
      checkpointedCheckpointNumber,
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
      this.signatureContext,
      this.config,
      this.timetable,
      this.slasherClient,
      this.epochCache,
      this.dateProvider,
      this.metrics,
      this.checkpointProposalJobMetrics.createRecorder(),
      this,
      this.setState.bind(this),
      this.tracer,
      this.log.getBindings(),
      proposedCheckpointData,
    );
  }

  /**
   * Returns the current sequencer state.
   */
  public getState(): SequencerState {
    return this.state;
  }

  /**
   * Internal helper for setting the sequencer state. Pure: sets the state, emits `state-changed`, and
   * records metrics. Timing deadlines are queried explicitly at the relevant call sites, not gated here.
   * @param proposedState - The new state to transition to.
   * @param slotNumber - The current slot number (informational; included in the event payload).
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
    const secondsIntoSlot = slotNumber !== undefined ? this.getSecondsIntoSlot(slotNumber) : undefined;

    const oldState = this.state;
    const oldStateSlotNumber = this.stateSlotNumber;
    const stateChanged = proposedState !== oldState;
    // Wall-clock time spent in the previous state: the delta between consecutive state-changing setState
    // calls, read from the date provider so it tracks simulated time under a test/manual clock.
    const transitionAtMs = this.dateProvider.now();
    const stateDurationMs = transitionAtMs - this.stateEnteredAtMs;

    const boringStates = [SequencerState.IDLE, SequencerState.SYNCHRONIZING];
    const logLevel =
      boringStates.includes(proposedState) && boringStates.includes(oldState) ? ('trace' as const) : ('debug' as const);
    this.stateLog[logLevel](`Transitioning from ${oldState} to ${proposedState}`, {
      oldState,
      newState: proposedState,
      slotNumber,
      stateSlotNumber: oldStateSlotNumber,
      secondsIntoSlot,
      ...(stateChanged && { stateDurationMs: Math.ceil(stateDurationMs) }),
    });

    this.emit('state-changed', {
      oldState,
      newState: proposedState,
      secondsIntoSlot,
      slot: slotNumber,
    });
    if (stateChanged) {
      this.metrics.recordStateDuration(stateDurationMs, oldState);
      this.stateEnteredAtMs = transitionAtMs;
      this.stateSlotNumber = slotNumber;
    }
    this.state = proposedState;
  }

  /**
   * Returns whether all dependencies have caught up.
   * We don't check against the previous block submitted since it may have been reorg'd out.
   */
  protected async checkSync(args: { ts: bigint; slot: SlotNumber }): Promise<SequencerSyncCheckResult | undefined> {
    // Check that the archiver has fully synced the L2 slot before the one we want to propose in.
    // The archiver reports sync progress via L1 block timestamps and synced checkpoint slots.
    // See getSyncedL2SlotNumber for how missed L1 blocks are handled.
    const syncedL2Slot = await this.l2BlockSource.getSyncedL2SlotNumber();
    const { slot } = args;
    if (syncedL2Slot === undefined || syncedL2Slot + 1 < slot) {
      this.log.debug(`Cannot propose block at next L2 slot ${slot} due to pending sync from L1`, {
        slot,
        syncedL2Slot,
      });
      return undefined;
    }

    const syncedBlocks = await Promise.all([
      this.worldState.status().then(({ syncSummary }) => ({
        number: syncSummary.latestBlockNumber,
        hash: syncSummary.latestBlockHash,
      })),
      this.l2BlockSource
        .getL2Tips()
        .then(t => ({ proposed: t.proposed, checkpointed: t.checkpointed, proposedCheckpoint: t.proposedCheckpoint })),
      this.p2pClient.getStatus().then(p2p => p2p.syncedToL2Block),
      this.l1ToL2MessageSource.getL2Tips().then(t => ({ proposed: t.proposed, checkpointed: t.checkpointed })),
      this.l2BlockSource.getPendingChainValidationStatus(),
      this.l2BlockSource.getProposedCheckpointData(),
    ] as const);

    const [worldState, l2Tips, p2p, l1ToL2MessageSourceTips, pendingChainValidationStatus, proposedCheckpointData] =
      syncedBlocks;

    const result =
      worldState.hash === l2Tips.proposed.hash &&
      p2p.hash === l2Tips.proposed.hash &&
      l1ToL2MessageSourceTips.proposed.hash === l2Tips.proposed.hash &&
      l1ToL2MessageSourceTips.checkpointed.block.hash === l2Tips.checkpointed.block.hash &&
      l1ToL2MessageSourceTips.checkpointed.checkpoint.hash === l2Tips.checkpointed.checkpoint.hash;

    if (!result) {
      this.log.debug(`Sequencer sync check failed`, {
        worldState,
        l2BlockSource: l2Tips.proposed,
        p2p,
        l1ToL2MessageSourceTips,
      });
      return undefined;
    }

    const blockNumber = worldState.number;
    const blockData = await this.l2BlockSource.getBlockData({ number: blockNumber });
    if (!blockData) {
      this.log.warn(`Sequencer sync check failed: failed to get L2 block data ${blockNumber} from the archiver`, {
        blockNumber,
        l2Tips,
        syncedL2Slot,
        ...args,
      });
      return undefined;
    }

    // Refuse to build a checkpoint on top of a proposed block whose enclosing checkpoint was never
    // proposed. Under pipelining we may have received and reexecuted such a block locally — advancing
    // our world-state tip past the checkpointed tip — while the proposing node never published the
    // matching proposed checkpoint (e.g. it crashed before assembling it). Building on this orphan block
    // would fork the chain off a tip no other node can follow. The archiver prunes these orphan blocks
    // once their build slot ends; this guard is the correctness barrier during the grace window before.
    if (
      blockData.checkpointNumber > l2Tips.checkpointed.checkpoint.number &&
      (l2Tips.proposedCheckpoint.checkpoint.number !== blockData.checkpointNumber ||
        proposedCheckpointData?.checkpointNumber !== blockData.checkpointNumber)
    ) {
      const logCtx = {
        blockCheckpointNumber: blockData.checkpointNumber,
        checkpointedCheckpointNumber: l2Tips.checkpointed.checkpoint.number,
        proposedCheckpointTipNumber: l2Tips.proposedCheckpoint.checkpoint.number,
        proposedCheckpointDataNumber: proposedCheckpointData?.checkpointNumber,
        blockNumber: blockData.header.getBlockNumber(),
        blockSlot: blockData.header.getSlot(),
        syncedL2Slot,
        ...args,
      };

      // Under pipelining the block proposal for a checkpoint leads its checkpoint proposal by up to one
      // slot, so a world-state tip sitting in an as-yet-unproposed checkpoint is the expected steady state
      // until that checkpoint is due. Only treat it as abnormal — and warn — once the checkpoint is overdue
      // by the same deadline the archiver uses to prune the orphan block (see pruneOrphanProposedBlocks).
      // Before then this is normal pipelining and we wait it out quietly.
      if (this.isProposedCheckpointOverdue(blockData.header.getSlot())) {
        this.log.warn(`Sequencer sync check failed: proposed block has no matching proposed checkpoint`, logCtx);
      } else {
        this.log.debug(`Waiting for proposed checkpoint to catch up with reexecuted block`, logCtx);
      }
      return undefined;
    }

    const hasProposedCheckpoint = l2Tips.proposedCheckpoint.checkpoint.number > l2Tips.checkpointed.checkpoint.number;

    // The l2Tips and proposedCheckpointData reads above come from independent archiver snapshots
    // (a JS-side tips cache vs. a direct store read on `#proposedCheckpoints`). A concurrent archiver
    // write that mutates both can be observed split, leaving us with `hasProposedCheckpoint=true` but
    // no proposedCheckpointData (or one whose number doesn't match the tip). Refuse to proceed in that
    // window — the next checkSync tick will see a coherent snapshot.
    if (
      hasProposedCheckpoint &&
      (!proposedCheckpointData ||
        proposedCheckpointData.checkpointNumber !== l2Tips.proposedCheckpoint.checkpoint.number)
    ) {
      this.log.warn(`Sequencer sync check failed: inconsistent proposed-checkpoint state`, {
        proposedCheckpointTipNumber: l2Tips.proposedCheckpoint.checkpoint.number,
        checkpointedTipNumber: l2Tips.checkpointed.checkpoint.number,
        proposedCheckpointDataNumber: proposedCheckpointData?.checkpointNumber,
        syncedL2Slot,
        ...args,
      });
      return undefined;
    }

    // Check that the proposed checkpoint is indeed the parent of the checkpoint we'll be building
    // The checkpoint number to build is derived as blockData.checkpointNumber + 1
    if (proposedCheckpointData && proposedCheckpointData.checkpointNumber !== blockData.checkpointNumber) {
      this.log.warn(`Sequencer sync check failed: proposed checkpoint number mismatch`, {
        proposedCheckpointNumber: proposedCheckpointData.checkpointNumber,
        blockCheckpointNumber: blockData.checkpointNumber,
        syncedL2Slot,
        ...args,
      });
      return undefined;
    }

    return {
      blockData,
      blockNumber: blockData.header.getBlockNumber(),
      checkpointNumber: blockData.checkpointNumber,
      checkpointedCheckpointNumber: l2Tips.checkpointed.checkpoint.number,
      archive: blockData.archive.root,
      hasProposedCheckpoint,
      proposedCheckpointData,
      syncedL2Slot,
      pendingChainValidationStatus,
    };
  }

  /**
   * Whether the enclosing checkpoint of a reexecuted block is overdue: past the deadline by which a
   * well-behaved proposer should have published it. Mirrors the archiver's orphan-prune deadline (the
   * start of the slot after the block's build slot, plus a grace period) so the sequencer only warns
   * about a missing proposed checkpoint once the archiver itself would prune the orphan block. The grace
   * is derived from the block build duration the same way the archiver defaults it at node wiring.
   */
  private isProposedCheckpointOverdue(blockSlot: SlotNumber): boolean {
    const expectedBySlot = SlotNumber(Number(blockSlot) - PROPOSER_PIPELINING_SLOT_OFFSET + 1);
    const graceSeconds =
      this.config.blockDurationMs !== undefined
        ? Math.ceil(this.config.blockDurationMs / 1000)
        : (this.config.minBlockDuration ?? DEFAULT_MIN_BLOCK_DURATION);
    const expectedByTime = getTimestampForSlot(expectedBySlot, this.l1Constants) + BigInt(graceSeconds);
    return BigInt(this.dateProvider.nowInSeconds()) >= expectedByTime;
  }

  /**
   * Checks if we are the proposer for the next slot.
   * @returns True if we can propose, and the proposer address (undefined if anyone can propose)
   */
  protected async checkCanPropose(targetSlot: SlotNumber): Promise<[boolean, EthAddress | undefined]> {
    let proposer: EthAddress | undefined;

    try {
      proposer = await this.epochCache.getProposerAttesterAddressInSlot(targetSlot);
    } catch (e) {
      if (e instanceof NoCommitteeError) {
        if (this.lastSlotForNoCommitteeWarning !== targetSlot) {
          this.lastSlotForNoCommitteeWarning = targetSlot;
          this.log.warn(`Cannot propose at target slot ${targetSlot} since the committee does not exist on L1`);
        }
        return [false, undefined];
      }
      this.log.error(`Error getting proposer for target slot ${targetSlot}`, e);
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
      this.log.debug(`Cannot propose at target slot ${targetSlot} since we are not a proposer`, {
        targetSlot,
        validatorAddresses,
        proposer,
      });
      return [false, proposer];
    }

    this.log.info(`We are the proposer for pipeline slot ${targetSlot}`, {
      targetSlot,
      proposer,
    });
    return [true, proposer];
  }

  /**
   * Tries to vote on slashing actions and governance when we cannot build and are past the block-building window.
   * This allows the sequencer to participate in governance/slashing votes even when it cannot build blocks.
   */
  @trackSpan('Sequencer.tryVoteWhenCannotBuild', ({ slot }) => ({ [Attributes.SLOT_NUMBER]: slot }))
  protected async tryVoteWhenCannotBuild(args: { slot: SlotNumber; targetSlot: SlotNumber }): Promise<void> {
    const { slot, targetSlot } = args;

    // Prevent duplicate attempts in the same slot
    if (this.lastSlotForFallbackVote === slot) {
      this.log.trace(`Already attempted to vote in slot ${slot} (skipping)`);
      return;
    }

    // Only vote (instead of waiting to build) once we are past the latest useful block-building start
    // for the target slot. Before then, there is still time to build, so do not give up the slot.
    const nowSeconds = this.dateProvider.now() / 1000;
    const startDeadline = this.timetable.getBuildStartDeadline(targetSlot);

    if (this.config.enforceTimeTable && nowSeconds <= startDeadline) {
      this.log.trace(`Not attempting to vote since there is still time for block building`, {
        nowSeconds,
        startDeadline,
      });
      return;
    }

    this.log.trace(`Cannot build for slot ${slot}, checking for voting opportunities`, {
      nowSeconds,
      startDeadline,
    });

    // Check if we're a proposer or proposal is open
    const [canPropose, proposer] = await this.checkCanPropose(targetSlot);
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

    // Enqueue governance and slashing votes (voter uses the target slot for L1 submission)
    const voter = new CheckpointVoter(
      targetSlot,
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
    // Votes are EIP-712-signed for `targetSlot` (the pipelined slot in which the multicall is
    // expected to mine). Delay submission to the start of `targetSlot` so the tx mines in the
    // slot the votes were signed for. We fire-and-forget so we don't block the sequencer's
    // work loop while waiting for the target slot to start.
    void publisher.sendRequestsAt(targetSlot).catch(err => {
      this.log.error(`Failed to publish votes despite sync failure for slot ${slot}`, err, { slot });
    });
  }

  /**
   * Tries to vote on slashing actions and governance proposals when escape hatch is open.
   * This allows the sequencer to participate in voting without performing checkpoint proposal work.
   */
  @trackSpan('Sequencer.tryVoteWhenEscapeHatchOpen', ({ slot }) => ({ [Attributes.SLOT_NUMBER]: slot }))
  protected async tryVoteWhenEscapeHatchOpen(args: {
    slot: SlotNumber;
    targetSlot: SlotNumber;
    proposer: EthAddress | undefined;
  }): Promise<void> {
    const { slot, targetSlot, proposer } = args;

    // Prevent duplicate attempts in the same slot
    if (this.lastSlotForFallbackVote === slot) {
      this.log.trace(`Already attempted to vote in slot ${slot} (escape hatch open, skipping)`);
      return;
    }

    // Mark this slot as attempted
    this.lastSlotForFallbackVote = slot;

    const { attestorAddress, publisher } = await this.publisherFactory.create(proposer);

    this.log.debug(`Escape hatch open for slot ${slot}, attempting vote-only actions`, {
      slot,
      targetSlot,
      attestorAddress,
    });

    // Under proposer pipelining, the multicall is expected to mine in `targetSlot` (slot + 1).
    // Governance and slashing votes are EIP-712-signed against the slot they will mine in, and the
    // L1 contract checks `msg.sender == getCurrentProposer()` using the mining slot. So we must
    // sign for `targetSlot` and delay submission to the start of `targetSlot`.
    const voter = new CheckpointVoter(
      targetSlot,
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

    this.log.info(`Voting in slot ${slot} (escape hatch open)`, { slot, targetSlot });
    // Votes are EIP-712-signed for `targetSlot`. Delay submission to the start of `targetSlot` so
    // the multicall mines in the slot the votes were signed for; otherwise the L1 contract reads
    // `signaler = getCurrentProposer()` against the wrong slot and signature verification fails
    // silently inside Multicall3. Fire-and-forget so we don't block the sequencer's work loop while
    // waiting for the target slot to start, mirroring tryVoteWhenCannotBuild.
    void publisher.sendRequestsAt(targetSlot).catch(err => {
      this.log.error(`Failed to publish escape-hatch votes for slot ${slot}`, err, { slot, targetSlot });
    });
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
    const { pendingChainValidationStatus, syncedL2Slot } = syncedTo;
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
      syncedL2Slot,
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

  private getSecondsIntoSlot(slotNumber: SlotNumber): number {
    const buildFrameStart = this.timetable.getBuildFrameStart(slotNumber);
    return Number((this.dateProvider.now() / 1000 - buildFrameStart).toFixed(3));
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

  /** Updates the publisher factory's node keystore adapter after a keystore reload. */
  public updatePublisherNodeKeyStore(adapter: NodeKeystoreAdapter): void {
    this.publisherFactory.updateNodeKeyStore(adapter);
  }

  public getConfig() {
    return this.config;
  }
}

type SequencerSyncCheckResult = {
  blockData?: BlockData;
  checkpointNumber: CheckpointNumber;
  checkpointedCheckpointNumber: CheckpointNumber;
  blockNumber: BlockNumber;
  archive: Fr;
  hasProposedCheckpoint: boolean;
  proposedCheckpointData?: ProposedCheckpointData;
  syncedL2Slot: SlotNumber;
  pendingChainValidationStatus: ValidateCheckpointResult;
};
