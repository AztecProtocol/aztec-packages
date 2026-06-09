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
import {
  type ChainConfig,
  DEFAULT_MAX_BLOCKS_PER_CHECKPOINT,
  MIN_PER_BLOCK_ALLOCATION_MULTIPLIER,
} from '@aztec/stdlib/config';
import { getEpochAtSlot } from '@aztec/stdlib/epoch-helpers';
import {
  MIN_PER_BLOCK_ALLOCATION_MULTIPLIER,
  MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER,
  computeNetworkTxGasLimits,
} from '@aztec/stdlib/gas';
import {
  type ResolvedSequencerConfig,
  type SequencerConfig,
  SequencerConfigSchema,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import type { CoordinationSignatureContext } from '@aztec/stdlib/p2p';
import { pickFromSchema } from '@aztec/stdlib/schemas';
import { ProposerTimetable, buildProposerTimetable } from '@aztec/stdlib/timetable';
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

  /** The (checkpoint, slot) of the last invalidation request we successfully simulated, to prevent
   * re-simulating and re-submitting the same invalidation across the many ticks within a single slot. */
  private lastInvalidationAttempt: { slot: SlotNumber; checkpointNumber: CheckpointNumber } | undefined;

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

  /**
   * Updates sequencer config by the defined values and rebuilds the timetable.
   *
   * The merged config is validated against a candidate before being committed: {@link buildTimetable} may
   * reject the candidate (invalid timing geometry, or per-block allocation multipliers below the network
   * minimums). On rejection we leave `this.config` and `this.timetable` untouched and rethrow, so a bad update
   * never leaves the sequencer running with a rejected config and a stale timetable.
   */
  public updateConfig(config: Partial<SequencerConfig>) {
    const filteredConfig = pickFromSchema(config, SequencerConfigSchema);
    const candidate = merge(this.config, filteredConfig);
    let timetable: ProposerTimetable;
    try {
      timetable = this.buildTimetable(candidate);
    } catch (err) {
      this.log.warn(`Rejecting sequencer config update: ${(err as Error).message}`, {
        rejectedConfig: omit(filteredConfig, 'txPublicSetupAllowListExtend'),
      });
      throw err;
    }
    this.config = candidate;
    this.timetable = timetable;
    this.log.info(`Updated sequencer config`, omit(filteredConfig, 'txPublicSetupAllowListExtend'));
  }

  /**
   * Builds the proposer timetable from the given config and L1 constants via the shared
   * {@link buildProposerTimetable} helper, so the sequencer derives the same blocks-per-checkpoint as the p2p
   * layer and `getNodeInfo`. The fast local/e2e profile and budget clamping happen inside
   * {@link ProposerTimetable}.
   *
   * Throws if the timing geometry is invalid or the per-block allocation multipliers are below the network
   * minimums; callers must treat a throw as a rejected config and not commit it.
   */
  private buildTimetable(config: ResolvedSequencerConfig): ProposerTimetable {
    const timetable = buildProposerTimetable(config, this.l1Constants);

    const maxNumberOfBlocks = timetable.getMaxBlocksPerCheckpoint();
    this.log.info(`Sequencer timetable initialized with ${maxNumberOfBlocks} blocks per slot`, {
      aztecSlotDuration: timetable.aztecSlotDuration,
      ethereumSlotDuration: timetable.ethereumSlotDuration,
      blockDuration: timetable.blockDuration,
      minBlockDuration: timetable.minBlockDuration,
      p2pPropagationTime: timetable.p2pPropagationTime,
      checkpointProposalPrepareTime: timetable.checkpointProposalPrepareTime,
      maxNumberOfBlocks,
    });

    if (timetable.isClampedByLocalBudgets()) {
      // The default cap is intentionally above what most geometries can achieve, so clamping it to the local
      // budgets is expected and not worth warning about; an explicitly configured network value is.
      const logFn =
        this.config.maxBlocksPerCheckpoint === DEFAULT_MAX_BLOCKS_PER_CHECKPOINT
          ? this.log.debug.bind(this.log)
          : this.log.warn.bind(this.log);
      logFn(`Network maxBlocksPerCheckpoint clamped down by local operational budgets`, {
        networkMaxBlocksPerCheckpoint: this.config.maxBlocksPerCheckpoint,
        locallyAchievableBlocksPerCheckpoint: timetable.locallyAchievableBlocksPerCheckpoint,
      });
    }

    this.assertConfigMeetsNetworkTxLimits(config, maxNumberOfBlocks);

    return timetable;
  }

  /**
   * Checks this node's configured per-block allocation against the network admission limit. A node
   * advertises and admits txs up to the limit derived from the network-minimum multipliers (see
   * {@link computeNetworkTxGasLimits}).
   *
   * Fails startup (and runtime config updates) only when the configured per-block allocation *multipliers*
   * (`perBlockAllocationMultiplier` / `perBlockDAAllocationMultiplier`) are below the network minimums: such
   * a node would accept txs over RPC/gossip that its builder can never pack into a block regardless of block
   * size. Operators may configure a higher (more generous) multiplier, but not a lower one.
   *
   * When the multipliers meet the floor but an absolute per-block gas cap (`maxDABlockGas` / `maxL2BlockGas`)
   * shrinks the builder's effective grant below the network limit, this is legitimate operator
   * restrictiveness — the node simply builds smaller blocks and such txs stay in the pool for other
   * proposers — so we only log a warning rather than failing startup. Restrictive tx-count caps
   * (`maxTxsPerBlock` / `maxTxsPerCheckpoint`) can likewise make the builder skip admitted txs; they are
   * intentionally not modeled here for the same reason.
   */
  private assertConfigMeetsNetworkTxLimits(config: ResolvedSequencerConfig, maxBlocksPerCheckpoint: number) {
    // Mirror CheckpointBuilder.capLimitsByCheckpointBudgets: DA falls back to the general multiplier.
    const l2Multiplier = config.perBlockAllocationMultiplier;
    const daMultiplier = config.perBlockDAAllocationMultiplier ?? l2Multiplier;

    // The allocation is monotonic in the multiplier, so a multiplier at or above the network minimum
    // guarantees the builder grants at least the network admission limit. Checking the multipliers directly
    // is sufficient (and strictly more conservative than modeling the resulting gas grant).
    if (daMultiplier < MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER) {
      throw new Error(
        `perBlockDAAllocationMultiplier (${daMultiplier}) is below the network minimum ` +
          `${MIN_PER_BLOCK_DA_ALLOCATION_MULTIPLIER}; the node would admit txs its own builder can never include.`,
      );
    }
    if (l2Multiplier < MIN_PER_BLOCK_ALLOCATION_MULTIPLIER) {
      throw new Error(
        `perBlockAllocationMultiplier (${l2Multiplier}) is below the network minimum ` +
          `${MIN_PER_BLOCK_ALLOCATION_MULTIPLIER}; the node would admit txs its own builder can never include.`,
      );
    }

    // Absolute per-block gas caps below the network admission limit are legitimate operator restrictiveness:
    // the node simply builds smaller blocks and such txs stay in the pool for other proposers. Warn only.
    const networkLimit = computeNetworkTxGasLimits({
      maxBlocksPerCheckpoint,
      manaCheckpointBudget: this.l1Constants.rollupManaLimit,
    });
    if (config.maxDABlockGas !== undefined && config.maxDABlockGas < networkLimit.daGas) {
      this.log.warn(
        `Sequencer maxDABlockGas (${config.maxDABlockGas}) is below the network DA admission limit ` +
          `(${networkLimit.daGas}): txs declaring more DA gas are admitted over RPC/gossip but will be skipped ` +
          `by this proposer's own blocks and left in the pool for other proposers.`,
        { maxDABlockGas: config.maxDABlockGas, networkDaGas: networkLimit.daGas, maxBlocksPerCheckpoint },
      );
    }
    if (config.maxL2BlockGas !== undefined && config.maxL2BlockGas < networkLimit.l2Gas) {
      this.log.warn(
        `Sequencer maxL2BlockGas (${config.maxL2BlockGas}) is below the network L2 admission limit ` +
          `(${networkLimit.l2Gas}): txs declaring more L2 gas are admitted over RPC/gossip but will be skipped ` +
          `by this proposer's own blocks and left in the pool for other proposers.`,
        { maxL2BlockGas: config.maxL2BlockGas, networkL2Gas: networkLimit.l2Gas, maxBlocksPerCheckpoint },
      );
    }
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
    this.lastCheckpointProposalJob?.interrupt();
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
    // Check we have not already processed this target slot (cheapest check).
    if (this.lastSlotForCheckpointProposalJob && this.lastSlotForCheckpointProposalJob >= targetSlot) {
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

    // Cheap proposer check first: most nodes are not the proposer for most slots, so gate the
    // expensive multi-subsystem checkSync (and the rest of the build path) behind it. Computed once
    // here and reused for the escape-hatch voting path below. No setState/timing gate on this path:
    // the build-start deadline gate runs only on the proposer build path after a successful checkSync.
    const [canPropose, proposer] = await this.checkCanPropose(targetSlot);

    // If escape hatch is open for the target epoch, do not start checkpoint proposal work and do not attempt invalidations.
    // Still perform governance/slashing voting (as proposer) once per slot.
    // When pipelining, we check the target epoch (slot+1's epoch) since that's the epoch we're building for.
    const isEscapeHatchOpen = await this.epochCache.isEscapeHatchOpen(targetEpoch);

    if (isEscapeHatchOpen) {
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

    // If we are not the proposer, check whether we should invalidate an invalid pending chain (a
    // liveness backstop) and bail before any sync work or build-timing gate. This reads only the
    // archiver's pending-chain validation status, which is authoritative on its own, instead of
    // running the full sync check. Wrapped in try/catch because this leaner path skips the broader
    // proposed-checkpoint/tip coherence screen that checkSync applied, so transient archiver
    // incoherence surfaces as a quiet skip rather than a work-loop error.
    if (!canPropose) {
      try {
        const pendingChainValidationStatus = await this.l2BlockSource.getPendingChainValidationStatus();
        await this.considerInvalidatingCheckpoint(pendingChainValidationStatus, slot);
      } catch (err) {
        this.log.warn(`Failed to consider invalidating checkpoint`, { err, slot, targetSlot });
      }
      return undefined;
    }

    // We are the proposer and the escape hatch is closed: now run the full sync check before building.
    const syncedTo = await this.checkSync({ ts, slot });
    if (!syncedTo) {
      await this.tryVoteWhenCannotBuild({ slot, targetSlot });
      return undefined;
    }

    // Explicit build-loop entry gate: if we are past the latest useful block-building start for the
    // target slot, abandon building for this slot. The proposer prioritizes the ideal L1-publish path
    // and does not plan around the late consensus-handoff path. This is the proposer build path's
    // timing gate; it runs only after we know we are the synced proposer, so non-proposer invalidation
    // and escape-hatch voting (which returned above) are never gated by build timing. Vote-only paths
    // still run when block building is abandoned.
    const startDeadline = this.timetable.getBuildStartDeadline(targetSlot);
    const nowForStartGate = this.dateProvider.now() / 1000;
    if (nowForStartGate > startDeadline) {
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

    // We are the synced proposer within the build window; enter the proposer-check state and build.
    this.setState(SequencerState.PROPOSER_CHECK, targetSlot);

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
   * @param slotNumber - The target slot being proposed for, emitted as `targetSlot` on the event payload
   * and used to anchor `secondsIntoBuildFrame`. Undefined for lifecycle states with no associated slot.
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
    const secondsIntoBuildFrame = slotNumber !== undefined ? this.getSecondsIntoBuildFrame(slotNumber) : undefined;

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
      secondsIntoBuildFrame,
      ...(stateChanged && { stateDurationMs: Math.ceil(stateDurationMs) }),
    });

    this.emit('state-changed', {
      oldState,
      newState: proposedState,
      secondsIntoBuildFrame,
      targetSlot: slotNumber,
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

      this.log.debug(`Waiting for proposed checkpoint to catch up with reexecuted block`, logCtx);
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

    // Vote-only actions do not give up the slot: if sync recovers, a later work-loop iteration can still build.
    // Under proposer pipelining the work loop reasons about the next L1 slot, so waiting for the target slot's
    // build-start deadline can miss the whole fallback window when the target advances with the clock.
    const nowSeconds = this.dateProvider.now() / 1000;
    const startDeadline = this.timetable.getBuildStartDeadline(targetSlot);

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
   * @param pendingChainValidationStatus - The archiver's pending-chain validation status, authoritative on its own.
   * @param currentSlot - The wall-clock slot, used for committee lookup, the per-(checkpoint, slot) dedup guard, and logging.
   */
  protected async considerInvalidatingCheckpoint(
    pendingChainValidationStatus: ValidateCheckpointResult,
    currentSlot: SlotNumber,
  ): Promise<void> {
    if (pendingChainValidationStatus.valid) {
      return;
    }

    const invalidCheckpointNumber = pendingChainValidationStatus.checkpoint.checkpointNumber;

    // Avoid re-running the committee lookup, simulation, and submission on every tick within a slot.
    // The guard is keyed by (checkpoint, slot) — so a different invalid checkpoint surfacing later in
    // the same slot is not suppressed — and is set only after a request is successfully simulated below,
    // so a transient simulation failure (or thresholds not yet met) still retries on the next tick.
    if (
      this.lastInvalidationAttempt?.slot === currentSlot &&
      this.lastInvalidationAttempt.checkpointNumber === invalidCheckpointNumber
    ) {
      this.log.trace(`Already attempted to invalidate checkpoint ${invalidCheckpointNumber} in slot ${currentSlot}`, {
        currentSlot,
        invalidCheckpointNumber,
      });
      return;
    }

    const invalidCheckpointTimestamp = pendingChainValidationStatus.checkpoint.timestamp;
    const timeSinceChainInvalid = this.dateProvider.nowInSeconds() - Number(invalidCheckpointTimestamp);
    const ourValidatorAddresses = this.validatorClient.getValidatorAddresses();

    const { secondsBeforeInvalidatingBlockAsCommitteeMember, secondsBeforeInvalidatingBlockAsNonCommitteeMember } =
      this.config;

    const logData = {
      invalidL1Timestamp: invalidCheckpointTimestamp,
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

    // We produced a valid invalidation request; record it so further ticks within this slot skip the
    // committee lookup, simulation, and submission above for this same invalid checkpoint.
    this.lastInvalidationAttempt = { slot: currentSlot, checkpointNumber: invalidCheckpointNumber };

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

  /**
   * Wall-clock seconds elapsed since the build-frame start of the given target slot
   * (`now − getBuildFrameStart(targetSlot)`). May be negative if called before the build frame opens.
   */
  private getSecondsIntoBuildFrame(targetSlot: SlotNumber): number {
    const buildFrameStart = this.timetable.getBuildFrameStart(targetSlot);
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
