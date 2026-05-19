import type { EpochCache } from '@aztec/epoch-cache';
import type { SimulationOverridesPlan } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { randomInt } from '@aztec/foundation/crypto/random';
import {
  flipSignature,
  generateRecoverableSignature,
  generateUnrecoverableSignature,
} from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { filter } from '@aztec/foundation/iterator';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { sleep, sleepUntil } from '@aztec/foundation/sleep';
import { type DateProvider, Timer } from '@aztec/foundation/timer';
import { type TypedEventEmitter, isErrorClass, unfreeze } from '@aztec/foundation/types';
import type { P2P } from '@aztec/p2p';
import type { SlasherClientInterface } from '@aztec/slasher';
import {
  CommitteeAttestation,
  CommitteeAttestationsAndSigners,
  L2Block,
  type L2BlockSink,
  type L2BlockSource,
  MaliciousCommitteeAttestationsAndSigners,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import {
  type Checkpoint,
  type ProposedCheckpointData,
  getPreviousCheckpointOutHashes,
  validateCheckpoint,
} from '@aztec/stdlib/checkpoint';
import { computeQuorum, getSlotStartBuildTimestamp, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import {
  type BlockBuilderOptions,
  InsufficientValidTxsError,
  type ResolvedSequencerConfig,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { type L1ToL2MessageSource, computeInHashFromL1ToL2Messages } from '@aztec/stdlib/messaging';
import type {
  BlockProposal,
  BlockProposalOptions,
  CheckpointAttestation,
  CheckpointProposal,
  CheckpointProposalOptions,
  CoordinationSignatureContext,
} from '@aztec/stdlib/p2p';
import { orderAttestations, trimAttestations } from '@aztec/stdlib/p2p';
import type { L2BlockBuiltStats } from '@aztec/stdlib/stats';
import { type FailedTx, Tx } from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';
import { Attributes, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';
import { CheckpointBuilder, type FullNodeCheckpointsBuilder, type ValidatorClient } from '@aztec/validator-client';
import { DutyAlreadySignedError, SlashingProtectionError } from '@aztec/validator-ha-signer/errors';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { InvalidateCheckpointRequest, SequencerPublisher } from '../publisher/sequencer-publisher.js';
import { buildCheckpointSimulationOverridesPlan } from './chain_state_overrides.js';
import type { CheckpointProposalJobMetricsRecorder } from './checkpoint_proposal_job_metrics.js';
import { CheckpointVoter } from './checkpoint_voter.js';
import { SequencerInterruptedError } from './errors.js';
import type { SequencerEvents } from './events.js';
import type { SequencerMetrics } from './metrics.js';
import type { SequencerTimetable } from './timetable.js';
import type { SequencerRollupConstants } from './types.js';
import { SequencerState } from './utils.js';

/** How much time to sleep while waiting for min transactions to accumulate for a block */
const TXS_POLLING_MS = 500;

/** Result from proposeCheckpoint when a checkpoint was successfully built and broadcast. */
type CheckpointProposalBroadcast = {
  checkpoint: Checkpoint;
  proposal: CheckpointProposal;
  blockProposedAt: number;
};

/** Result after attestation collection and signing, ready for L1 submission. */
type CheckpointProposalResult = {
  checkpoint: Checkpoint;
  attestations: CommitteeAttestationsAndSigners;
  attestationsSignature: Signature;
};

/**
 * Handles the execution of a checkpoint proposal after the initial preparation phase.
 * This includes building blocks, collecting attestations, and publishing the checkpoint to L1,
 * as well as enqueueing votes for slashing and governance proposals. This class is created from
 * the Sequencer once the check for being the proposer for the slot has succeeded.
 */
export class CheckpointProposalJob implements Traceable {
  protected readonly log: Logger;
  private readonly checkpointEventLog: Logger;

  /** Tracks the fire-and-forget L1 submission promise so it can be awaited during shutdown. */
  private pendingL1Submission: Promise<void> | undefined;

  /**
   * Chain state overrides built once per slot in proposeCheckpoint after the checkpoint is
   * complete. Carries the pending parent override (archive + slot + fee header) for pipelining,
   * or the invalidation pending override when rolling back. Consumed by
   * publisher.validateBlockHeader before broadcast.
   */
  private checkpointSimulationOverridesPlan?: SimulationOverridesPlan;

  private getSignatureContext(): CoordinationSignatureContext {
    return this.signatureContext;
  }

  constructor(
    private readonly slotNow: SlotNumber,
    private readonly targetSlot: SlotNumber,
    private readonly targetEpoch: EpochNumber,
    private readonly checkpointNumber: CheckpointNumber,
    private readonly syncedToBlockNumber: BlockNumber,
    private readonly checkpointedCheckpointNumber: CheckpointNumber,
    // TODO(palla/mbps): Can we remove the proposer in favor of attestorAddress? Need to check fisherman-node flows.
    private readonly proposer: EthAddress | undefined,
    private readonly publisher: SequencerPublisher,
    private readonly attestorAddress: EthAddress,
    private readonly invalidateCheckpoint: InvalidateCheckpointRequest | undefined,
    private readonly validatorClient: ValidatorClient,
    private readonly globalsBuilder: GlobalVariableBuilder,
    private readonly p2pClient: P2P,
    private readonly worldState: WorldStateSynchronizer,
    private readonly l1ToL2MessageSource: L1ToL2MessageSource,
    private readonly l2BlockSource: L2BlockSource,
    private readonly checkpointsBuilder: FullNodeCheckpointsBuilder,
    private readonly blockSink: L2BlockSink,
    private readonly l1Constants: SequencerRollupConstants,
    private readonly signatureContext: CoordinationSignatureContext,
    protected config: ResolvedSequencerConfig,
    protected timetable: SequencerTimetable,
    private readonly slasherClient: SlasherClientInterface | undefined,
    private readonly epochCache: EpochCache,
    private readonly dateProvider: DateProvider,
    private readonly metrics: SequencerMetrics,
    private readonly checkpointMetrics: CheckpointProposalJobMetricsRecorder,
    protected readonly eventEmitter: TypedEventEmitter<SequencerEvents>,
    private readonly setStateFn: (state: SequencerState, slot?: SlotNumber) => void,
    public readonly tracer: Tracer,
    bindings?: LoggerBindings,
    private readonly proposedCheckpointData?: ProposedCheckpointData,
  ) {
    this.log = createLogger('sequencer:checkpoint-proposal', {
      ...bindings,
      instanceId: `slot-${this.slotNow}`,
    });
    this.checkpointEventLog = createLogger('sequencer:checkpoint-events', {
      ...bindings,
      instanceId: `slot-${this.slotNow}`,
    });
  }

  /** Awaits the pending L1 submission if one is in progress. Call during shutdown. */
  public async awaitPendingSubmission(): Promise<void> {
    this.log.info('Awaiting pending L1 payload submission');
    await this.pendingL1Submission;
  }

  private logCheckpointEvent(eventName: string, message: string, fields: Record<string, unknown>): void {
    this.checkpointEventLog.debug(message, {
      eventName: `sequencer-checkpoint-${eventName}`,
      ...fields,
    });
  }

  /**
   * Executes the checkpoint proposal job.
   * Builds blocks, assembles checkpoint, and broadcasts the proposal (blocking).
   * Attestation collection, signing, and L1 submission are backgrounded so the
   * work loop can return to IDLE immediately for consecutive slot proposals.
   * Returns the built checkpoint if successful, undefined otherwise.
   */
  @trackSpan('CheckpointProposalJob.execute')
  public async execute(): Promise<Checkpoint | undefined> {
    // Enqueue governance and slashing votes (returns promises that will be awaited later)
    // In fisherman mode, we simulate slashing but don't actually publish to L1
    // These are constant for the whole slot, so we only enqueue them once
    const votesPromises = new CheckpointVoter(
      this.targetSlot,
      this.publisher,
      this.attestorAddress,
      this.validatorClient,
      this.slasherClient,
      this.l1Constants,
      this.config,
      this.metrics,
      this.log,
    ).enqueueVotes();

    // Build blocks, assemble checkpoint, and broadcast proposal (BLOCKING).
    // Returns after broadcast — attestation collection is deferred.
    const broadcast = await this.proposeCheckpoint();

    if (!broadcast) {
      await Promise.all(votesPromises);
      // Still submit votes even without a checkpoint.
      // Under proposer pipelining, vote-offenses signatures are EIP-712-bound to `targetSlot`
      // (the pipelined slot in which the multicall is expected to mine). Submitting at the
      // wall-clock time would let the multicall mine in a different L2 slot, causing
      // signature verification to fail silently inside Multicall3. Delay submission to the
      // start of `targetSlot` so the tx mines in the slot the vote was signed for.
      if (!this.config.fishermanMode) {
        this.pendingL1Submission = this.publisher.sendRequestsAt(this.targetSlot).then(() => {});
      }
      return undefined;
    }

    const { checkpoint } = broadcast;
    this.metrics.recordCheckpointProposalSuccess();

    // Do not post anything to L1 if we are fishermen, but do perform L1 fee analysis
    if (this.config.fishermanMode) {
      await this.handleCheckpointEndAsFisherman(checkpoint);
      return checkpoint;
    }

    // Background the attestation → signing → L1 pipeline so the work loop is unblocked
    this.pendingL1Submission = this.waitForAttestationsAndEnqueueSubmissionAsync(broadcast, votesPromises);

    // Return the built checkpoint immediately — the work loop is now unblocked
    return checkpoint;
  }

  /**
   * Background pipeline: collects attestations, signs them, enqueues the checkpoint, and submits to L1.
   * Runs as a fire-and-forget task stored in `pendingL1Submission` so the work loop is unblocked.
   */
  private async waitForAttestationsAndEnqueueSubmissionAsync(
    broadcast: CheckpointProposalBroadcast,
    votesPromises: Promise<unknown>[],
  ): Promise<void> {
    const { checkpoint } = broadcast;
    const isPipelining = this.epochCache.isProposerPipeliningEnabled();

    try {
      // Wait for all votes actions, enqueued at the beginning, to resolve
      await Promise.all(votesPromises);

      // Try to collect attestations from the committee
      const signedAttestations = await this.getSignedCommitteeAttestations(broadcast);

      // If pipelining, wait for the previous checkpoint to land on L1 before submitting,
      // so we can check it matches the proposed checkpoint we used as parent, and has valid attestations.
      if (signedAttestations && (!isPipelining || (await this.waitForValidParentCheckpointOnL1()))) {
        await this.enqueueCheckpointForSubmission({ checkpoint, ...signedAttestations });
      }

      // If we failed to collect attestations, at least check if we need to issue an invalidation
      // Note that if we are not pipelining, we enqueued the invalidation at the beginning
      if (!signedAttestations && isPipelining && (await this.waitForSyncedL2SlotNumber(this.slotNow))) {
        const validationStatus = await this.l2BlockSource.getPendingChainValidationStatus();
        if (!validationStatus.valid) {
          this.log.warn(
            `Checkpoint ${validationStatus.checkpoint.checkpointNumber} has invalid attestations, enqueuing invalidation in spite of attestation collection failure`,
            { checkpoint: validationStatus.checkpoint, reason: validationStatus.reason },
          );
          await this.enqueueInvalidation(validationStatus);
        }
      }

      // Send whatever was enqueued: votes + (propose | invalidation | nothing).
      const l1Response = await this.publisher.sendRequestsAt(this.targetSlot);
      const proposedAction = l1Response?.successfulActions.find(a => a === 'propose');
      if (proposedAction) {
        this.logCheckpointEvent('published', `Checkpoint published for slot ${this.targetSlot}`, {
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          successfulActions: l1Response?.successfulActions,
          sentActions: l1Response?.sentActions,
        });
        this.eventEmitter.emit('checkpoint-published', { checkpoint: this.checkpointNumber, slot: this.targetSlot });
        const coinbase = checkpoint.header.coinbase;
        await this.metrics.incFilledSlot(this.publisher.getSenderAddress().toString(), coinbase);
      } else {
        this.logCheckpointEvent('publish-failed', `Checkpoint publish failed for slot ${this.targetSlot}`, {
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          successfulActions: l1Response?.successfulActions,
          failedActions: l1Response?.failedActions,
          sentActions: l1Response?.sentActions,
          expiredActions: l1Response?.expiredActions,
          reason: 'propose_action_not_successful',
        });
        this.log.warn(`Checkpoint publish failed for slot ${this.targetSlot}`, {
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          successfulActions: l1Response?.successfulActions,
          failedActions: l1Response?.failedActions,
          sentActions: l1Response?.sentActions,
          expiredActions: l1Response?.expiredActions,
          reason: 'propose_action_not_successful',
        });
        this.eventEmitter.emit('checkpoint-publish-failed', { ...l1Response, slot: this.targetSlot });
        if (isPipelining) {
          this.metrics.recordPipelineDiscard();
        }
      }
    } catch (err) {
      if (err instanceof SequencerInterruptedError) {
        return;
      }
      this.logCheckpointEvent('publish-failed', `Checkpoint publish failed for slot ${this.targetSlot}`, {
        slot: this.targetSlot,
        checkpointNumber: this.checkpointNumber,
        reason: err instanceof Error ? err.message : String(err),
      });
      this.log.error(`Background attestation/L1 pipeline failed for slot ${this.targetSlot}`, err, {
        slot: this.targetSlot,
        checkpointNumber: this.checkpointNumber,
        reason: err instanceof Error ? err.message : String(err),
      });
      this.eventEmitter.emit('checkpoint-publish-failed', { slot: this.targetSlot });
      if (isPipelining) {
        this.metrics.recordPipelineDiscard();
      }
    }
  }

  /** Enqueues the checkpoint for L1 submission. Called after pipeline sleep in execute(). */
  private async enqueueCheckpointForSubmission(result: CheckpointProposalResult): Promise<void> {
    const { checkpoint, attestations, attestationsSignature } = result;

    this.setStateFn(SequencerState.PUBLISHING_CHECKPOINT, this.targetSlot);
    const aztecSlotDuration = this.l1Constants.slotDuration;
    const submissionSlotStart = Number(getTimestampForSlot(this.targetSlot, this.l1Constants));
    const txTimeoutAt = new Date((submissionSlotStart + aztecSlotDuration) * 1000);

    // If we have been configured to potentially skip publishing checkpoint then roll the dice here
    if (
      this.config.skipPublishingCheckpointsPercent !== undefined &&
      this.config.skipPublishingCheckpointsPercent > 0
    ) {
      const roll = Math.max(0, randomInt(100));
      if (roll < this.config.skipPublishingCheckpointsPercent) {
        this.log.warn(
          `Skipping publishing proposal for checkpoint ${checkpoint.number}. Configured percentage: ${this.config.skipPublishingCheckpointsPercent}, generated value: ${roll}`,
        );
        return;
      }
    }

    await this.publisher.enqueueProposeCheckpoint(checkpoint, attestations, attestationsSignature, {
      txTimeoutAt,
    });
  }

  /**
   * Wait until the archiver syncs past the given L2 slot number.
   * The deadline is the end of `this.targetSlot`, beyond which any pipelined work would miss its
   * L1 submission window and is no longer useful.
   */
  private async waitForSyncedL2SlotNumber(waitForSlot: SlotNumber): Promise<boolean> {
    const targetSlotStart = Number(getTimestampForSlot(this.targetSlot, this.l1Constants));
    const targetSlotEndMs = (targetSlotStart + this.l1Constants.slotDuration) * 1000;
    const syncDelayTolerance = this.l1Constants.ethereumSlotDuration * 2 * 1000;
    const timeoutSeconds = Math.max(0.1, (targetSlotEndMs + syncDelayTolerance - this.dateProvider.now()) / 1000);

    try {
      return await retryUntil(
        async () => {
          const syncedSlot = await this.l2BlockSource.getSyncedL2SlotNumber();
          return syncedSlot !== undefined && syncedSlot >= waitForSlot;
        },
        `archiver sync past slot ${waitForSlot}`,
        timeoutSeconds,
        0.2,
      );
    } catch {
      this.log.warn(
        `Archiver did not sync L1 past slot ${waitForSlot} before slot ${this.targetSlot} expired, discarding pipelined work`,
        { checkpointNumber: this.checkpointNumber },
      );
      this.emitPipelinedCheckpointDiscarded('archiver-sync-timeout');
      return false;
    }
  }

  /**
   * Waits for the parent checkpoint to land on L1 before submitting a pipelined checkpoint.
   * Polls until the archiver has synced L1 past the parent's slot, then verifies:
   * - If we built on a proposed parent: it must have landed on L1 with matching hash and valid attestations.
   * - If we built without a proposed parent: no new checkpoint must have appeared for that slot.
   * If the parent has invalid attestations, enqueues an invalidation. Returns whether to proceed with the proposal.
   */
  protected async waitForValidParentCheckpointOnL1(): Promise<boolean> {
    const parentCheckpointNumber = CheckpointNumber(this.checkpointNumber - 1);

    // Wait until archiver has synced L1 past the parent's slot (slotNow)
    if (!(await this.waitForSyncedL2SlotNumber(this.slotNow))) {
      return false;
    }

    const tips = await this.l2BlockSource.getL2Tips();
    const checkpointedNumber = tips.checkpointed.checkpoint.number;

    // We built on top of a proposed checkpoint. Verify it landed on L1 as expected.
    if (this.proposedCheckpointData) {
      // After syncing from L1 we see the chain tip has invalid attestations. This means the parent checkpoint was posted
      // with invalid attestations, or it built on top of something with invalid attestations and didnt invalidate them.
      // Either way, we thought our parent would be valid, so we have to throw away our work. But at least we'll try and
      // invalidate on L1 so we clean up the chain for the next proposer. And we'll slash them, but that's handled elsewhere.
      const validationStatus = await this.l2BlockSource.getPendingChainValidationStatus();
      if (!validationStatus.valid) {
        this.log.warn(
          `Parent checkpoint ${parentCheckpointNumber} has invalid attestations, discarding pipelined work`,
          { checkpointNumber: this.checkpointNumber, reason: validationStatus.reason },
        );
        this.emitPipelinedCheckpointDiscarded('parent-invalid-attestations');
        await this.enqueueInvalidation(validationStatus);
        return false;
      }

      // The pending chain is valid. But did the parent checkpoint land on L1 at all?
      if (checkpointedNumber < parentCheckpointNumber) {
        this.log.warn(`Parent checkpoint ${parentCheckpointNumber} did not land on L1, discarding pipelined work`, {
          checkpointNumber: this.checkpointNumber,
          checkpointedNumber,
        });
        this.emitPipelinedCheckpointDiscarded('parent-not-on-l1');
        return false;
      }

      // It landed. But is it the one we were expecting?
      const expectedHash = this.proposedCheckpointData.header.hash().toString();
      if (tips.checkpointed.checkpoint.hash !== expectedHash) {
        this.log.warn(`Parent checkpoint ${parentCheckpointNumber} hash mismatch on L1, discarding pipelined work`, {
          checkpointNumber: this.checkpointNumber,
          expectedHash,
          actualHash: tips.checkpointed.checkpoint.hash,
        });
        this.emitPipelinedCheckpointDiscarded('parent-hash-mismatch');
        return false;
      }

      return true;
    } else {
      // We didn't see a proposed checkpoint at build time, so we built on checkpointed parent from two slots ago.
      // But if a new checkpoint for the previous slot appeared on L1 in the meantime, our checkpoint assumed the wrong parent,
      // so we have to discard our work. This can happen if we're somehow cut off from p2p and fail to see the checkpoint
      // proposal for the previous slot.
      if (checkpointedNumber > parentCheckpointNumber) {
        this.log.warn(
          `Unexpected checkpoint ${checkpointedNumber} landed on L1 after we built on top of parent ${parentCheckpointNumber}, discarding pipelined work`,
          { checkpointNumber: this.checkpointNumber, checkpointedNumber },
        );
        this.emitPipelinedCheckpointDiscarded('unexpected-parent-appeared');
        return false;
      }

      return true;
    }
  }

  /** Emits the pipelined-checkpoint-discarded event and records the metric. */
  private emitPipelinedCheckpointDiscarded(reason: string): void {
    this.metrics.recordPipelineParentCheckpointMismatch(reason);
    this.eventEmitter.emit('pipelined-checkpoint-discarded', {
      slot: this.targetSlot,
      checkpointNumber: this.checkpointNumber,
      reason,
    });
  }

  /** Simulates and enqueues an invalidation request for the invalid parent checkpoint. */
  private async enqueueInvalidation(validationStatus: ValidateCheckpointResult): Promise<void> {
    if (this.config.skipInvalidateBlockAsProposer) {
      this.log.warn(`Skipping checkpoint invalidation as proposer due to test configuration`);
      return;
    }
    const invalidateRequest = await this.publisher.simulateInvalidateCheckpoint(validationStatus);
    if (invalidateRequest) {
      const submissionSlotStart = Number(getTimestampForSlot(this.targetSlot, this.l1Constants));
      const txTimeoutAt = new Date((submissionSlotStart + this.l1Constants.slotDuration) * 1000);
      this.publisher.enqueueInvalidateCheckpoint(invalidateRequest, { txTimeoutAt });
    } else {
      this.log.info(`Invalidation simulation returned undefined, checkpoint may have been removed already`, {
        checkpointNumber: this.checkpointNumber,
      });
    }
  }

  @trackSpan('CheckpointProposalJob.proposeCheckpoint', function () {
    return {
      // nullish operator needed for tests
      [Attributes.COINBASE]: this.validatorClient.getCoinbaseForAttestor(this.attestorAddress)?.toString(),
      [Attributes.SLOT_NUMBER]: this.targetSlot,
    };
  })
  private async proposeCheckpoint(): Promise<CheckpointProposalBroadcast | undefined> {
    try {
      const now = this.dateProvider.now();
      if (this.epochCache.isProposerPipeliningEnabled() && this.proposedCheckpointData) {
        // Measure against the wall-clock slot whose build window we are currently using.
        // In pipelining mode `targetSlot` is intentionally one slot ahead, which makes the
        // target-slot boundary a full slot away from the actual build start time.
        const slotBoundaryMs = Number(getTimestampForSlot(this.slotNow, this.l1Constants)) * 1000;
        this.checkpointMetrics.recordPipelinedCheckpointBuildStartOffsetFromSlotBoundary(now - slotBoundaryMs);
      }
      this.checkpointMetrics.startCheckpointTiming(now);

      // Get operator configured coinbase and fee recipient for this attestor
      const coinbase = this.validatorClient.getCoinbaseForAttestor(this.attestorAddress);
      const feeRecipient = this.validatorClient.getFeeRecipientForAttestor(this.attestorAddress);

      // Start the checkpoint
      this.setStateFn(SequencerState.INITIALIZING_CHECKPOINT, this.targetSlot);
      this.logCheckpointEvent('slot-started', `Starting checkpoint proposal for slot ${this.targetSlot}`, {
        buildSlot: this.slotNow,
        submissionSlot: this.targetSlot,
        slot: this.targetSlot,
        checkpointNumber: this.checkpointNumber,
        pipelining: this.epochCache.isProposerPipeliningEnabled(),
        proposer: this.proposer?.toString(),
        attestorAddress: this.attestorAddress.toString(),
        publisherAddress: this.publisher.getSenderAddress().toString(),
        coinbase: coinbase.toString(),
      });
      this.metrics.incOpenSlot(this.targetSlot, this.proposer?.toString() ?? 'unknown');

      // Enqueues checkpoint invalidation (constant for the whole slot)
      if (this.invalidateCheckpoint && !this.config.skipInvalidateBlockAsProposer) {
        this.publisher.enqueueInvalidateCheckpoint(this.invalidateCheckpoint);
      }

      // Build the simulation plan for this slot. When pipelining, this overrides L1's view of
      // pending/archive/fee-header to "as if the proposed parent had landed", so both the
      // mana-min-fee simulation (in the globals builder) and the pre-broadcast
      // validateBlockHeader see the chain tip the eventual L1 send will see.
      const isPipelining = this.epochCache.isProposerPipeliningEnabled();
      this.checkpointSimulationOverridesPlan = await buildCheckpointSimulationOverridesPlan({
        checkpointNumber: this.checkpointNumber,
        proposedCheckpointData: isPipelining ? this.proposedCheckpointData : undefined,
        invalidateToPendingCheckpointNumber: this.invalidateCheckpoint?.forcePendingCheckpointNumber,
        checkpointedCheckpointNumber: this.checkpointedCheckpointNumber,
        rollup: this.publisher.rollupContract,
        signatureContext: this.signatureContext,
        log: this.log,
      });

      const checkpointGlobalVariables = await this.globalsBuilder.buildCheckpointGlobalVariables(
        coinbase,
        feeRecipient,
        this.targetSlot,
        this.checkpointSimulationOverridesPlan,
      );

      // Collect L1 to L2 messages for the checkpoint and compute their hash
      const l1ToL2Messages = await this.l1ToL2MessageSource.getL1ToL2Messages(this.checkpointNumber);
      const inHash = computeInHashFromL1ToL2Messages(l1ToL2Messages);

      // Collect the out hashes of all the checkpoints before this one in the same epoch.
      // Under pipelining the parent checkpoint may not be on L1 yet at build time, so the helper
      // splices in the parent's checkpointOutHash from the locally-known proposed checkpoint so
      // the resulting `epochOutHash` matches what validators (and L1) compute once the parent
      // lands on L1.
      const previousCheckpointOutHashes = await getPreviousCheckpointOutHashes({
        blockSource: this.l2BlockSource,
        epoch: this.targetEpoch,
        checkpointNumber: this.checkpointNumber,
        l1Constants: this.epochCache.getL1Constants(),
        pipeliningEnabled: this.epochCache.isProposerPipeliningEnabled(),
        proposedCheckpointData: this.proposedCheckpointData,
        log: this.log,
      });

      // Anchor the modifier to the predicted parent fee header: L1 will apply it against
      // that, not against the latest published checkpoint (which lags by one under pipelining).
      const predictedParentEthPerFeeAssetE12 =
        this.checkpointSimulationOverridesPlan?.pendingCheckpointState?.feeHeader?.ethPerFeeAsset;
      const feeAssetPriceModifier = await this.publisher.getFeeAssetPriceModifier(predictedParentEthPerFeeAssetE12);

      // Create a long-lived forked world state for the checkpoint builder
      await using fork = await this.worldState.fork(this.syncedToBlockNumber, { closeDelayMs: 12_000 });

      // Create checkpoint builder for the entire slot
      const checkpointBuilder = await this.checkpointsBuilder.startCheckpoint(
        this.checkpointNumber,
        checkpointGlobalVariables,
        feeAssetPriceModifier,
        l1ToL2Messages,
        previousCheckpointOutHashes,
        fork,
        this.log.getBindings(),
      );

      // Options for the validator client when creating block and checkpoint proposals
      const blockProposalOptions: BlockProposalOptions = {
        publishFullTxs: !!this.config.publishTxsWithProposals,
        broadcastInvalidBlockProposal: this.config.broadcastInvalidBlockProposal,
      };

      const checkpointProposalOptions: CheckpointProposalOptions = {
        publishFullTxs: !!this.config.publishTxsWithProposals,
        broadcastInvalidCheckpointProposal:
          this.config.broadcastInvalidCheckpointProposalOnly || this.config.broadcastInvalidBlockProposal,
      };

      let blocksInCheckpoint: L2Block[] = [];
      let blockPendingBroadcast: BlockProposal | undefined = undefined;
      const checkpointBuildTimer = new Timer();

      try {
        // Main loop: build blocks for the checkpoint
        const result = await this.buildBlocksForCheckpoint(
          checkpointBuilder,
          checkpointGlobalVariables.timestamp,
          inHash,
          blockProposalOptions,
        );
        blocksInCheckpoint = result.blocksInCheckpoint;
        blockPendingBroadcast = result.blockPendingBroadcast;
      } catch (err) {
        // These errors are expected in HA mode, so we yield and let another HA node handle the slot
        // The only distinction between the 2 errors is SlashingProtectionError throws when the payload is different,
        // which is normal for block building (may have picked different txs)
        if (this.handleHASigningError(err, 'Block proposal')) {
          return undefined;
        }
        throw err;
      }

      if (blocksInCheckpoint.length === 0) {
        this.logCheckpointEvent('build-failed', `Checkpoint build failed for slot ${this.targetSlot}`, {
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          reason: 'no_blocks_built',
        });
        this.log.warn(`No blocks were built for slot ${this.targetSlot}`, {
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          reason: 'no_blocks_built',
        });
        this.eventEmitter.emit('checkpoint-empty', { slot: this.targetSlot });
        return undefined;
      }

      const minBlocksForCheckpoint = this.config.minBlocksForCheckpoint;
      if (minBlocksForCheckpoint !== undefined && blocksInCheckpoint.length < minBlocksForCheckpoint) {
        this.logCheckpointEvent('build-failed', `Checkpoint build failed for slot ${this.targetSlot}`, {
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          blocksBuilt: blocksInCheckpoint.length,
          minBlocksForCheckpoint,
          reason: 'min_blocks_not_met',
        });
        this.log.warn(
          `Checkpoint has fewer blocks than minimum (${blocksInCheckpoint.length} < ${minBlocksForCheckpoint}), skipping proposal`,
          {
            slot: this.targetSlot,
            checkpointNumber: this.checkpointNumber,
            blocksBuilt: blocksInCheckpoint.length,
            minBlocksForCheckpoint,
            reason: 'min_blocks_not_met',
          },
        );
        return undefined;
      }

      // Assemble and broadcast the checkpoint proposal, including the last block that was not
      // broadcasted yet, and wait to collect the committee attestations.
      this.setStateFn(SequencerState.ASSEMBLING_CHECKPOINT, this.targetSlot);
      const checkpoint = await checkpointBuilder.completeCheckpoint();

      // Final validation: per-block limits are only checked if the operator set them explicitly.
      // Otherwise, checkpoint-level budgets were already enforced by the redistribution logic.
      try {
        validateCheckpoint(checkpoint, {
          rollupManaLimit: this.l1Constants.rollupManaLimit,
          maxL2BlockGas: this.config.maxL2BlockGas,
          maxDABlockGas: this.config.maxDABlockGas,
          maxTxsPerBlock: this.config.maxTxsPerBlock,
          maxTxsPerCheckpoint: this.config.maxTxsPerCheckpoint,
        });
      } catch (err) {
        this.logCheckpointEvent('build-failed', `Checkpoint build failed for slot ${this.targetSlot}`, {
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          blocksBuilt: blocksInCheckpoint.length,
          reason: 'invalid_checkpoint',
          checkpoint: checkpoint.header.toInspect(),
        });
        this.log.error(`Built an invalid checkpoint at slot ${this.slotNow} (skipping proposal)`, err, {
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          blocksBuilt: blocksInCheckpoint.length,
          reason: 'invalid_checkpoint',
          checkpoint: checkpoint.header.toInspect(),
        });
        return undefined;
      }

      // Record checkpoint-level build metrics
      this.checkpointMetrics.recordCheckpointBuild(
        checkpointBuildTimer.ms(),
        blocksInCheckpoint.length,
        checkpoint.getStats().txCount,
        Number(checkpoint.header.totalManaUsed.toBigInt()),
      );
      this.logCheckpointEvent('built', `Checkpoint built for slot ${this.targetSlot}`, {
        slot: this.targetSlot,
        buildSlot: this.slotNow,
        checkpointNumber: this.checkpointNumber,
        proposer: this.proposer?.toString(),
        attestorAddress: this.attestorAddress.toString(),
        publisherAddress: this.publisher.getSenderAddress().toString(),
        blocksBuilt: blocksInCheckpoint.length,
        txCount: checkpoint.getStats().txCount,
        totalMana: Number(checkpoint.header.totalManaUsed.toBigInt()),
      });

      // In fisherman mode, return the checkpoint without broadcasting or collecting attestations
      if (this.config.fishermanMode) {
        this.log.info(
          `Built checkpoint for slot ${this.targetSlot} with ${blocksInCheckpoint.length} blocks. ` +
            `Skipping proposal in fisherman mode.`,
          {
            slot: this.targetSlot,
            checkpoint: checkpoint.header.toInspect(),
            blocksBuilt: blocksInCheckpoint.length,
          },
        );
        this.metrics.recordCheckpointSuccess();
        // Return a broadcast result with a dummy proposal — fisherman mode skips attestation collection
        return { checkpoint, proposal: undefined!, blockProposedAt: this.dateProvider.now() };
      }

      // Validate the header against L1 state before broadcasting.
      // If this fails the slot is aborted before any gossip work; state drift between here
      // and the eventual L1 send is caught by the bundle simulate at send time.
      try {
        await this.publisher.validateBlockHeader(checkpoint.header, this.checkpointSimulationOverridesPlan);
      } catch (err) {
        this.log.error(`Pre-broadcast header validation failed for slot ${this.targetSlot}; aborting`, err, {
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
        });
        this.metrics.recordCheckpointProposalFailed('header_validation_failed');
        this.eventEmitter.emit('header-validation-failed', {
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          reason: err instanceof Error ? err.message : String(err),
        });
        return undefined;
      }

      // Create the checkpoint proposal and broadcast it
      const proposal = await this.validatorClient.createCheckpointProposal(
        checkpoint.header,
        checkpoint.archive.root,
        this.checkpointNumber,
        feeAssetPriceModifier,
        blockPendingBroadcast,
        this.proposer,
        checkpointProposalOptions,
      );

      const blockProposedAt = this.dateProvider.now();
      if (!this.config.skipBroadcastProposals) {
        await this.p2pClient.broadcastCheckpointProposal(proposal);
        this.checkpointMetrics.noteCheckpointBroadcast(this.dateProvider.now());
      }

      // Return immediately after broadcast — attestation collection happens in the background
      return { checkpoint, proposal, blockProposedAt };
    } catch (err) {
      if (err && (err instanceof DutyAlreadySignedError || err instanceof SlashingProtectionError)) {
        // swallow this error. It's already been logged by a function deeper in the stack
        return undefined;
      }

      this.log.error(`Error building checkpoint at slot ${this.targetSlot}`, err);
      return undefined;
    }
  }

  /**
   * Builds blocks for a checkpoint within the current slot.
   */
  @trackSpan('CheckpointProposalJob.buildBlocksForCheckpoint')
  private async buildBlocksForCheckpoint(
    checkpointBuilder: CheckpointBuilder,
    timestamp: bigint,
    inHash: Fr,
    blockProposalOptions: BlockProposalOptions,
  ): Promise<{
    blocksInCheckpoint: L2Block[];
    blockPendingBroadcast: BlockProposal | undefined;
  }> {
    const blocksInCheckpoint: L2Block[] = [];
    const txHashesAlreadyIncluded = new Set<string>();
    const initialBlockNumber = BlockNumber(this.syncedToBlockNumber + 1);

    // Last block in the checkpoint will usually be flagged as pending broadcast, so we send it along with the checkpoint proposal
    let blockPendingBroadcast: BlockProposal | undefined = undefined;

    while (true) {
      const blocksBuilt = blocksInCheckpoint.length;
      const indexWithinCheckpoint = IndexWithinCheckpoint(blocksBuilt);
      const blockNumber = BlockNumber(initialBlockNumber + blocksBuilt);

      if (blocksBuilt >= this.config.maxBlocksPerCheckpoint) {
        this.log.debug(`Reached max blocks per checkpoint`, {
          slot: this.targetSlot,
          blocksBuilt,
          maxBlocksPerCheckpoint: this.config.maxBlocksPerCheckpoint,
        });
        break;
      }

      const secondsIntoSlot = this.getSecondsIntoSlot();
      const timingInfo = this.timetable.canStartNextBlock(secondsIntoSlot);

      if (!timingInfo.canStart) {
        this.log.debug(`Not enough time left in slot to start another block`, {
          slot: this.targetSlot,
          blocksBuilt,
          secondsIntoSlot,
        });
        break;
      }

      const buildResult = await this.buildSingleBlock(checkpointBuilder, {
        // Create all blocks with the same timestamp
        blockTimestamp: timestamp,
        // Create an empty block if we haven't already and this is the last one
        forceCreate: timingInfo.isLastBlock && blocksBuilt === 0 && this.config.buildCheckpointIfEmpty,
        // Build deadline is only set if we are enforcing the timetable
        buildDeadline: timingInfo.deadline
          ? new Date((this.getSlotStartBuildTimestamp() + timingInfo.deadline) * 1000)
          : undefined,
        blockNumber,
        indexWithinCheckpoint,
        txHashesAlreadyIncluded,
      });

      // If we failed to build the block due to insufficient txs, we try again if there is still time left in the slot
      if ('failure' in buildResult) {
        // If this was the last subslot, or we're running with a single block per slot, we're done
        if (timingInfo.isLastBlock || timingInfo.deadline === undefined) {
          break;
        }
        // Otherwise, if there is still time for more blocks, we wait until the next subslot and try again
        await this.waitUntilNextSubslot(timingInfo.deadline);
        continue;
      }

      // If there was an error building the block, we just exit the loop and give up the rest of the slot.
      // We don't want to risk building more blocks if something went wrong.
      if ('error' in buildResult) {
        if (!(buildResult.error instanceof SequencerInterruptedError)) {
          this.log.warn(`Halting block building for slot ${this.targetSlot}`, {
            slot: this.targetSlot,
            blocksBuilt,
            error: buildResult.error,
          });
        }
        break;
      }

      const { block, usedTxs } = buildResult;
      this.checkpointMetrics.noteCheckpointBlockBuilt(this.dateProvider.now(), {
        isFirstBlock: blocksBuilt === 0,
        isLastBlock: timingInfo.isLastBlock,
      });

      blocksInCheckpoint.push(block);
      usedTxs.forEach(tx => txHashesAlreadyIncluded.add(tx.txHash.toString()));

      // Sign the block proposal. This will throw if HA signing fails.
      const proposal = await this.createBlockProposal(block, inHash, usedTxs, {
        ...blockProposalOptions,
        broadcastInvalidBlockProposal:
          blockProposalOptions.broadcastInvalidBlockProposal ||
          block.indexWithinCheckpoint === this.config.invalidBlockProposalIndexWithinCheckpoint,
      });

      // Sync the proposed block to the archiver to make it available, only after we've managed to sign the proposal,
      // so we avoid polluting our archive with a block that would fail.
      // We wait for the sync to succeed, as this helps catch consistency errors, even if it means we lose some time for block-building.
      // If this throws, we abort the entire checkpoint.
      await this.syncProposedBlockToArchiver(block);

      // If this is the last block, do not broadcast it, since it will be included in the checkpoint proposal.
      if (timingInfo.isLastBlock) {
        this.log.verbose(`Completed final block ${blockNumber} for slot ${this.targetSlot}`, {
          slot: this.targetSlot,
          blockNumber,
          blocksBuilt,
        });

        blockPendingBroadcast = proposal;
        break;
      }

      // Once we have a signed proposal and the archiver agreed with our proposed block, then we broadcast it.
      if (proposal && !this.config.skipBroadcastProposals) {
        await this.p2pClient.broadcastProposal(proposal);
      }

      // Wait until the next block's start time
      await this.waitUntilNextSubslot(timingInfo.deadline);
    }

    this.log.verbose(`Block building loop completed for slot ${this.targetSlot}`, {
      slot: this.targetSlot,
      blocksBuilt: blocksInCheckpoint.length,
    });

    return { blocksInCheckpoint, blockPendingBroadcast };
  }

  /** Creates a block proposal for a given block via the validator client (unless in fisherman mode) */
  private createBlockProposal(
    block: L2Block,
    inHash: Fr,
    usedTxs: Tx[],
    blockProposalOptions: BlockProposalOptions,
  ): Promise<BlockProposal | undefined> {
    if (this.config.fishermanMode) {
      this.log.info(`Skipping block proposal for block ${block.number} in fisherman mode`);
      return Promise.resolve(undefined);
    }
    return this.validatorClient.createBlockProposal(
      block.header,
      this.checkpointNumber,
      block.indexWithinCheckpoint,
      inHash,
      block.archive.root,
      usedTxs,
      this.proposer,
      blockProposalOptions,
    );
  }

  /** Sleeps until it is time to produce the next block in the slot */
  @trackSpan('CheckpointProposalJob.waitUntilNextSubslot')
  private async waitUntilNextSubslot(nextSubslotStart: number) {
    this.setStateFn(SequencerState.WAITING_UNTIL_NEXT_BLOCK, this.targetSlot);
    this.log.verbose(`Waiting until time for the next block at ${nextSubslotStart}s into slot`, {
      slot: this.targetSlot,
    });
    await this.waitUntilTimeInSlot(nextSubslotStart);
  }

  /** Builds a single block. Called from the main block building loop. */
  @trackSpan('CheckpointProposalJob.buildSingleBlock')
  protected async buildSingleBlock(
    checkpointBuilder: CheckpointBuilder,
    opts: {
      forceCreate?: boolean;
      blockTimestamp: bigint;
      blockNumber: BlockNumber;
      indexWithinCheckpoint: IndexWithinCheckpoint;
      buildDeadline: Date | undefined;
      txHashesAlreadyIncluded: Set<string>;
    },
  ): Promise<
    { block: L2Block; usedTxs: Tx[] } | { failure: 'insufficient-txs' | 'insufficient-valid-txs' } | { error: Error }
  > {
    const { blockTimestamp, forceCreate, blockNumber, indexWithinCheckpoint, buildDeadline, txHashesAlreadyIncluded } =
      opts;

    this.log.verbose(
      `Preparing block ${blockNumber} index ${indexWithinCheckpoint} at checkpoint ${this.checkpointNumber} for slot ${this.targetSlot}`,
      { ...checkpointBuilder.getConstantData(), ...opts },
    );

    try {
      // Wait until we have enough txs to build the block
      const { availableTxs, canStartBuilding, minTxs } = await this.waitForMinTxs(opts);
      if (!canStartBuilding) {
        this.logCheckpointEvent('block-build-failed', `Block build failed for slot ${this.targetSlot}`, {
          reason: 'insufficient_txs',
          blockNumber,
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          indexWithinCheckpoint,
          availableTxs,
          minTxs,
        });
        this.log.warn(
          `Not enough txs to build block ${blockNumber} at index ${indexWithinCheckpoint} in slot ${this.targetSlot} (got ${availableTxs} txs but needs ${minTxs})`,
          {
            reason: 'insufficient_txs',
            blockNumber,
            slot: this.targetSlot,
            checkpointNumber: this.checkpointNumber,
            indexWithinCheckpoint,
            availableTxs,
            minTxs,
          },
        );
        this.eventEmitter.emit('block-tx-count-check-failed', { minTxs, availableTxs, slot: this.targetSlot });
        this.metrics.recordBlockProposalFailed('insufficient_txs');
        return { failure: 'insufficient-txs' };
      }

      // Create iterator to pending txs. We filter out txs already included in previous blocks in the checkpoint
      // just in case p2p failed to sync the provisional block and didn't get to remove those txs from the mempool yet.
      const pendingTxs = filter(
        this.p2pClient.iterateEligiblePendingTxs(),
        tx => !txHashesAlreadyIncluded.has(tx.txHash.toString()),
      );

      this.log.debug(
        `Building block ${blockNumber} at index ${indexWithinCheckpoint} for slot ${this.targetSlot} with ${availableTxs} available txs`,
        { slot: this.targetSlot, blockNumber, indexWithinCheckpoint },
      );
      this.setStateFn(SequencerState.CREATING_BLOCK, this.targetSlot);

      // Per-block limits are operator overrides (from SEQ_MAX_L2_BLOCK_GAS etc.) further capped
      // by remaining checkpoint-level budgets inside CheckpointBuilder before each block is built.
      // minValidTxs is passed into the builder so it can reject the block *before* updating state.
      const minValidTxs = forceCreate ? 0 : (this.config.minValidTxsPerBlock ?? minTxs);
      const blockBuilderOptions: BlockBuilderOptions = {
        maxTransactions: this.config.maxTxsPerBlock,
        maxBlockGas:
          this.config.maxL2BlockGas !== undefined || this.config.maxDABlockGas !== undefined
            ? new Gas(this.config.maxDABlockGas ?? Infinity, this.config.maxL2BlockGas ?? Infinity)
            : undefined,
        deadline: buildDeadline,
        isBuildingProposal: true,
        minValidTxs,
        maxBlocksPerCheckpoint: this.timetable.maxNumberOfBlocks,
        perBlockAllocationMultiplier: this.config.perBlockAllocationMultiplier,
      };

      // Actually build the block by executing txs. The builder throws InsufficientValidTxsError
      // if the number of successfully processed txs is below minValidTxs, ensuring state is not
      // updated for blocks that will be discarded.
      const buildResult = await this.buildSingleBlockWithCheckpointBuilder(
        checkpointBuilder,
        pendingTxs,
        blockNumber,
        blockTimestamp,
        blockBuilderOptions,
      );

      // If any txs failed during execution, drop them from the mempool so we don't pick them up again
      await this.dropFailedTxsFromP2P(buildResult.failedTxs);

      if (buildResult.status === 'insufficient-valid-txs') {
        this.logCheckpointEvent('block-build-failed', `Block build failed for slot ${this.targetSlot}`, {
          reason: 'insufficient_valid_txs',
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          blockNumber,
          numTxs: buildResult.processedCount,
          indexWithinCheckpoint,
          minValidTxs,
        });
        this.log.warn(
          `Block ${blockNumber} at index ${indexWithinCheckpoint} on slot ${this.targetSlot} has too few valid txs to be proposed`,
          {
            reason: 'insufficient_valid_txs',
            slot: this.targetSlot,
            checkpointNumber: this.checkpointNumber,
            blockNumber,
            numTxs: buildResult.processedCount,
            indexWithinCheckpoint,
            minValidTxs,
          },
        );
        this.eventEmitter.emit('block-build-failed', {
          reason: `Insufficient valid txs`,
          slot: this.targetSlot,
        });
        this.metrics.recordBlockProposalFailed('insufficient_valid_txs');
        return { failure: 'insufficient-valid-txs' };
      }

      // Block creation succeeded, emit stats and metrics
      const { block, publicProcessorDuration, usedTxs, blockBuildDuration, numTxs } = buildResult;

      const blockStats = {
        eventName: 'l2-block-built',
        duration: blockBuildDuration,
        publicProcessDuration: publicProcessorDuration,
        ...block.getStats(),
      } satisfies L2BlockBuiltStats;

      const blockHash = await block.hash();
      const txHashes = block.body.txEffects.map(tx => tx.txHash);
      const manaPerSec = block.header.totalManaUsed.toNumberUnsafe() / (blockBuildDuration / 1000);

      this.log.info(
        `Built block ${block.number} at checkpoint ${this.checkpointNumber} for slot ${this.targetSlot} with ${numTxs} txs`,
        { blockHash, txHashes, manaPerSec, ...blockStats },
      );

      // `slot` is the target/submission slot (may be one ahead when pipelining),
      // `buildSlot` is the wall-clock slot during which the block was actually built.
      this.eventEmitter.emit('block-proposed', {
        blockNumber: block.number,
        blockHash,
        checkpointNumber: this.checkpointNumber,
        indexWithinCheckpoint: block.indexWithinCheckpoint,
        slot: this.targetSlot,
        buildSlot: this.slotNow,
      });
      this.metrics.recordBuiltBlock(blockBuildDuration, block.header.totalManaUsed.toNumberUnsafe(), this.targetSlot);

      return { block, usedTxs };
    } catch (err: any) {
      this.eventEmitter.emit('block-build-failed', {
        reason: err.message,
        slot: this.targetSlot,
      });
      this.logCheckpointEvent('block-build-failed', `Block build failed for slot ${this.targetSlot}`, {
        reason: err instanceof Error ? err.message : String(err),
        slot: this.targetSlot,
        checkpointNumber: this.checkpointNumber,
        blockNumber,
      });
      this.log.error(`Error building block`, err, {
        reason: err instanceof Error ? err.message : String(err),
        slot: this.targetSlot,
        checkpointNumber: this.checkpointNumber,
        blockNumber,
      });
      this.metrics.recordBlockProposalFailed(err.name || 'unknown_error');
      this.metrics.recordFailedBlock();
      return { error: err };
    }
  }

  /** Uses the checkpoint builder to build a block, catching InsufficientValidTxsError. */
  private async buildSingleBlockWithCheckpointBuilder(
    checkpointBuilder: CheckpointBuilder,
    pendingTxs: AsyncIterable<Tx>,
    blockNumber: BlockNumber,
    blockTimestamp: bigint,
    blockBuilderOptions: BlockBuilderOptions,
  ) {
    try {
      const workTimer = new Timer();
      const result = await checkpointBuilder.buildBlock(pendingTxs, blockNumber, blockTimestamp, blockBuilderOptions);
      const blockBuildDuration = workTimer.ms();
      return { ...result, blockBuildDuration, status: 'success' as const };
    } catch (err: unknown) {
      if (isErrorClass(err, InsufficientValidTxsError)) {
        return {
          failedTxs: err.failedTxs,
          processedCount: err.processedCount,
          status: 'insufficient-valid-txs' as const,
        };
      }
      throw err;
    }
  }

  /** Waits until minTxs are available on the pool for building a block. */
  @trackSpan('CheckpointProposalJob.waitForMinTxs')
  private async waitForMinTxs(opts: {
    forceCreate?: boolean;
    blockNumber: BlockNumber;
    indexWithinCheckpoint: IndexWithinCheckpoint;
    buildDeadline: Date | undefined;
  }): Promise<{ canStartBuilding: boolean; availableTxs: number; minTxs: number }> {
    const { indexWithinCheckpoint, blockNumber, buildDeadline, forceCreate } = opts;

    // We only allow a block with 0 txs in the first block of the checkpoint
    const minTxs = indexWithinCheckpoint > 0 && this.config.minTxsPerBlock === 0 ? 1 : this.config.minTxsPerBlock;

    // Deadline is undefined if we are not enforcing the timetable, meaning we'll exit immediately when out of time
    const startBuildingDeadline = buildDeadline
      ? new Date(buildDeadline.getTime() - this.timetable.minExecutionTime * 1000)
      : undefined;

    let availableTxs = await this.p2pClient.getPendingTxCount();

    while (!forceCreate && availableTxs < minTxs) {
      // If we're past deadline, or we have no deadline, give up
      const now = this.dateProvider.nowAsDate();
      if (startBuildingDeadline === undefined || now >= startBuildingDeadline) {
        return { canStartBuilding: false, availableTxs, minTxs };
      }

      // Wait a bit before checking again
      this.setStateFn(SequencerState.WAITING_FOR_TXS, this.targetSlot);
      this.log.verbose(
        `Waiting for enough txs to build block ${blockNumber} at index ${indexWithinCheckpoint} in slot ${this.targetSlot} (have ${availableTxs} but need ${minTxs})`,
        { blockNumber, slot: this.targetSlot, indexWithinCheckpoint },
      );
      await this.waitForTxsPollingInterval();
      availableTxs = await this.p2pClient.getPendingTxCount();
    }

    return { canStartBuilding: true, availableTxs, minTxs };
  }

  private async getSignedCommitteeAttestations(
    broadcast: CheckpointProposalBroadcast,
  ): Promise<{ attestations: CommitteeAttestationsAndSigners; attestationsSignature: Signature } | undefined> {
    const { proposal, blockProposedAt } = broadcast;
    this.setStateFn(SequencerState.COLLECTING_ATTESTATIONS, this.targetSlot);
    const attestations = await this.waitForAttestations(proposal);
    if (!attestations) {
      return undefined;
    }
    this.checkpointMetrics.recordCheckpointAttestationDelay(this.dateProvider.now() - blockProposedAt);

    // Proposer must sign over the attestations before pushing them to L1
    const signer = this.proposer ?? this.publisher.getSenderAddress();
    try {
      const attestationsSignature = await this.validatorClient.signAttestationsAndSigners(
        attestations,
        signer,
        this.targetSlot,
        this.checkpointNumber,
      );
      return { attestations, attestationsSignature };
    } catch (err) {
      if (this.handleHASigningError(err, 'Attestations signature')) {
        return;
      }
      this.log.error(`Error signing attestations for checkpoint proposal at slot ${proposal.slotNumber}`, err);
      return undefined;
    }
  }

  /**
   * Waits for enough attestations to be collected via p2p.
   * This is run after all blocks for the checkpoint have been built.
   */
  @trackSpan('CheckpointProposalJob.waitForAttestations')
  private async waitForAttestations(
    proposal: CheckpointProposal,
  ): Promise<CommitteeAttestationsAndSigners | undefined> {
    if (this.config.fishermanMode) {
      this.log.debug('Skipping attestation collection in fisherman mode');
      return CommitteeAttestationsAndSigners.empty(this.getSignatureContext());
    }

    const slotNumber = proposal.slotNumber;
    const { committee, seed, epoch } = await this.epochCache.getCommittee(slotNumber);

    if (!committee) {
      throw new Error('No committee when collecting attestations');
    } else if (committee.length === 0) {
      this.log.verbose(`Attesting committee is empty`);
      return CommitteeAttestationsAndSigners.empty(this.getSignatureContext());
    } else {
      this.log.debug(`Attesting committee length is ${committee.length}`, { committee });
    }

    const numberOfRequiredAttestations = computeQuorum(committee.length);

    if (this.config.skipCollectingAttestations) {
      this.log.warn('Skipping attestation collection as per config (attesting with own keys only)');
      const attestations = await this.validatorClient?.collectOwnAttestations(proposal, this.checkpointNumber);
      this.logCheckpointAttestations('collected', committee, attestations ?? [], numberOfRequiredAttestations, {
        reason: 'collect_own_only',
      });
      return new CommitteeAttestationsAndSigners(
        orderAttestations(attestations ?? [], committee),
        this.getSignatureContext(),
      );
    }

    const attestationTimeAllowed = this.config.enforceTimeTable
      ? this.timetable.getCheckpointAttestationDeadline()
      : this.l1Constants.slotDuration;
    const attestationDeadline = new Date((this.getSlotStartBuildTimestamp() + attestationTimeAllowed) * 1000);

    this.metrics.recordRequiredAttestations(numberOfRequiredAttestations, attestationTimeAllowed);

    const collectAttestationsTimer = new Timer();
    let collectedAttestationsCount: number = 0;
    try {
      const attestations = await this.validatorClient.collectAttestations(
        proposal,
        numberOfRequiredAttestations,
        attestationDeadline,
        this.checkpointNumber,
      );

      collectedAttestationsCount = attestations.length;

      // Trim attestations to minimum required to save L1 calldata gas
      const localAddresses = this.validatorClient.getValidatorAddresses();
      const trimmed = trimAttestations(
        attestations,
        numberOfRequiredAttestations,
        this.attestorAddress,
        localAddresses,
      );
      if (trimmed.length < attestations.length) {
        this.log.debug(`Trimmed attestations from ${attestations.length} to ${trimmed.length} for L1 submission`);
      }

      // Rollup contract requires that the signatures are provided in the order of the committee
      const sorted = orderAttestations(trimmed, committee);
      this.logCheckpointAttestations('collected', committee, attestations, numberOfRequiredAttestations, {
        submittedCount: trimmed.length,
      });

      // Manipulate the attestations if we've been configured to do so
      if (
        this.config.injectFakeAttestation ||
        this.config.injectHighSValueAttestation ||
        this.config.injectUnrecoverableSignatureAttestation ||
        this.config.shuffleAttestationOrdering
      ) {
        return this.manipulateAttestations(proposal.slotNumber, epoch, seed, committee, sorted);
      }

      return new CommitteeAttestationsAndSigners(sorted, this.getSignatureContext());
    } catch (err) {
      if (err && err instanceof AttestationTimeoutError) {
        collectedAttestationsCount = err.collectedCount;
        this.logCheckpointAttestations('failed', committee, undefined, numberOfRequiredAttestations, {
          collectedCount: collectedAttestationsCount,
          reason: 'timeout',
        });
        this.log.error(
          `Timeout while waiting for attestations for checkpoint proposal at slot ${proposal.slotNumber} (collected ${collectedAttestationsCount}/${numberOfRequiredAttestations})`,
          err,
        );
      } else {
        this.logCheckpointAttestations('failed', committee, undefined, numberOfRequiredAttestations, {
          collectedCount: collectedAttestationsCount,
          reason: err instanceof Error ? err.message : String(err),
        });
        this.log.error(`Error collecting attestations for checkpoint proposal at slot ${proposal.slotNumber}`, err);
      }
      return undefined;
    } finally {
      this.metrics.recordCollectedAttestations(collectedAttestationsCount, collectAttestationsTimer.ms());
    }
  }

  private logCheckpointAttestations(
    status: 'collected' | 'failed',
    committee: EthAddress[],
    attestations: CheckpointAttestation[] | undefined,
    requiredAttestations: number,
    opts: { collectedCount?: number; submittedCount?: number; reason?: string } = {},
  ) {
    const signedValidators =
      attestations
        ?.map(attestation => attestation.getSender()?.toString())
        .filter((address): address is `0x${string}` => address !== undefined) ?? [];
    const collectedCount = opts.collectedCount ?? new Set(signedValidators).size;
    const missingValidatorCount = status === 'failed' ? Math.max(0, requiredAttestations - collectedCount) : undefined;
    this.logCheckpointEvent(`attestations-${status}`, `Checkpoint attestations ${status} for slot ${this.targetSlot}`, {
      slot: this.targetSlot,
      checkpointNumber: this.checkpointNumber,
      committeeSize: committee.length,
      requiredAttestations,
      collectedAttestations: collectedCount,
      ...(opts.submittedCount !== undefined && { submittedAttestations: opts.submittedCount }),
      ...(missingValidatorCount !== undefined && { missingValidatorCount }),
      ...(opts.reason !== undefined && { reason: opts.reason }),
    });
  }

  /** Breaks the attestations before publishing based on attack configs */
  private manipulateAttestations(
    slotNumber: SlotNumber,
    epoch: EpochNumber,
    seed: bigint,
    committee: EthAddress[],
    attestations: CommitteeAttestation[],
  ) {
    // Compute the proposer index in the committee, since we dont want to tweak it.
    // Otherwise, the L1 rollup contract will reject the block outright.
    const proposerIndex = Number(
      this.epochCache.computeProposerIndex(slotNumber, epoch, seed, BigInt(committee.length)),
    );

    if (
      this.config.injectFakeAttestation ||
      this.config.injectHighSValueAttestation ||
      this.config.injectUnrecoverableSignatureAttestation
    ) {
      // Find non-empty attestations that are not from the proposer
      const nonProposerIndices: number[] = [];
      for (let i = 0; i < attestations.length; i++) {
        if (!attestations[i].signature.isEmpty() && i !== proposerIndex) {
          nonProposerIndices.push(i);
        }
      }
      if (nonProposerIndices.length > 0) {
        const targetIndex = nonProposerIndices[randomInt(nonProposerIndices.length)];
        if (this.config.injectHighSValueAttestation) {
          this.log.warn(
            `Injecting high-s value attestation in checkpoint for slot ${slotNumber} at index ${targetIndex}`,
          );
          unfreeze(attestations[targetIndex]).signature = flipSignature(attestations[targetIndex].signature);
        } else if (this.config.injectUnrecoverableSignatureAttestation) {
          this.log.warn(
            `Injecting unrecoverable signature attestation in checkpoint for slot ${slotNumber} at index ${targetIndex}`,
          );
          unfreeze(attestations[targetIndex]).signature = generateUnrecoverableSignature();
        } else {
          this.log.warn(`Injecting fake attestation in checkpoint for slot ${slotNumber} at index ${targetIndex}`);
          unfreeze(attestations[targetIndex]).signature = generateRecoverableSignature();
        }
      }
      return new CommitteeAttestationsAndSigners(attestations, this.getSignatureContext());
    }

    if (this.config.shuffleAttestationOrdering) {
      this.log.warn(`Shuffling attestation ordering in checkpoint for slot ${slotNumber} (proposer #${proposerIndex})`);

      const shuffled = [...attestations];

      // Find two non-proposer positions that both have non-empty signatures to swap.
      // This ensures the bitmap doesn't change, so the MaliciousCommitteeAttestationsAndSigners
      // signers array stays correctly aligned with L1's committee reconstruction.
      const swappable: number[] = [];
      for (let k = 0; k < shuffled.length; k++) {
        if (!shuffled[k].signature.isEmpty() && k !== proposerIndex) {
          swappable.push(k);
        }
      }
      if (swappable.length >= 2) {
        const [i, j] = [swappable[0], swappable[1]];
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }

      const signers = new CommitteeAttestationsAndSigners(attestations, this.getSignatureContext()).getSigners();
      return new MaliciousCommitteeAttestationsAndSigners(shuffled, signers, this.getSignatureContext());
    }

    return new CommitteeAttestationsAndSigners(attestations, this.getSignatureContext());
  }

  private async dropFailedTxsFromP2P(failedTxs: FailedTx[]) {
    if (failedTxs.length === 0) {
      return;
    }
    const failedTxData = failedTxs.map(fail => fail.tx);
    const failedTxHashes = failedTxData.map(tx => tx.getTxHash());
    this.log.verbose(`Dropping failed txs ${failedTxHashes.join(', ')}`);
    await this.p2pClient.handleFailedExecution(failedTxHashes);
  }

  /**
   * Adds the proposed block to the archiver so it's available via P2P.
   * Gossip doesn't echo messages back to the sender, so the proposer's archiver/world-state
   * would never receive its own block without this explicit sync.
   *
   * In fisherman mode we skip this push: the fisherman builds blocks locally for validation
   * and fee analysis only, and pushing them to the archiver causes spurious reorg cascades
   * whenever the real proposer's block arrives from L1.
   */
  private async syncProposedBlockToArchiver(block: L2Block): Promise<void> {
    if (this.config.skipPushProposedBlocksToArchiver || this.config.fishermanMode) {
      this.log.warn(`Skipping push of proposed block ${block.number} to archiver`, {
        blockNumber: block.number,
        slot: block.header.globalVariables.slotNumber,
      });
      return;
    }
    this.log.debug(`Syncing proposed block ${block.number} to archiver`, {
      blockNumber: block.number,
      slot: block.header.globalVariables.slotNumber,
    });
    await this.blockSink.addBlock(block);
  }

  /** Runs fee analysis and logs checkpoint outcome as fisherman */
  private async handleCheckpointEndAsFisherman(checkpoint: Checkpoint | undefined) {
    // Perform L1 fee analysis before clearing requests
    // The callback is invoked asynchronously after the next block is mined
    const feeAnalysis = await this.publisher.analyzeL1Fees(this.targetSlot, analysis =>
      this.metrics.recordFishermanFeeAnalysis(analysis),
    );

    if (checkpoint) {
      this.log.info(`Validation checkpoint building SUCCEEDED for slot ${this.targetSlot}`, {
        ...checkpoint.toCheckpointInfo(),
        ...checkpoint.getStats(),
        feeAnalysisId: feeAnalysis?.id,
      });
    } else {
      this.log.warn(`Validation block building FAILED for slot ${this.targetSlot}`, {
        slot: this.targetSlot,
        feeAnalysisId: feeAnalysis?.id,
      });
      this.metrics.recordCheckpointProposalFailed('block_build_failed');
    }

    this.publisher.clearPendingRequests();
  }

  /**
   * Helper to handle HA double-signing errors. Returns true if the error was handled (caller should yield).
   */
  private handleHASigningError(err: any, errorContext: string): boolean {
    if (err instanceof DutyAlreadySignedError) {
      this.log.info(`${errorContext} for slot ${this.targetSlot} already signed by another HA node, yielding`, {
        slot: this.targetSlot,
        signedByNode: err.signedByNode,
      });
      return true;
    }
    if (err instanceof SlashingProtectionError) {
      this.log.info(`${errorContext} for slot ${this.targetSlot} blocked by slashing protection, yielding`, {
        slot: this.targetSlot,
        existingMessageHash: err.existingMessageHash,
        attemptedMessageHash: err.attemptedMessageHash,
      });
      return true;
    }
    return false;
  }

  /** Waits until a specific time within the current slot */
  @trackSpan('CheckpointProposalJob.waitUntilTimeInSlot')
  protected async waitUntilTimeInSlot(targetSecondsIntoSlot: number): Promise<void> {
    const slotStartTimestamp = this.getSlotStartBuildTimestamp();
    const targetTimestamp = slotStartTimestamp + targetSecondsIntoSlot;
    await sleepUntil(new Date(targetTimestamp * 1000), this.dateProvider.nowAsDate());
  }

  /** Waits the polling interval for transactions. Extracted for test overriding. */
  protected async waitForTxsPollingInterval(): Promise<void> {
    await sleep(TXS_POLLING_MS);
  }

  private getSlotStartBuildTimestamp(): number {
    return getSlotStartBuildTimestamp(this.slotNow, this.l1Constants);
  }

  private getSecondsIntoSlot(): number {
    const slotStartTimestamp = this.getSlotStartBuildTimestamp();
    return Number((this.dateProvider.now() / 1000 - slotStartTimestamp).toFixed(3));
  }

  public getPublisher() {
    return this.publisher;
  }
}
