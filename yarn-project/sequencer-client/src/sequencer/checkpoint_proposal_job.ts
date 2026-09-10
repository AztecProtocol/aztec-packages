import { type EpochCache, PROPOSER_PIPELINING_SLOT_OFFSET } from '@aztec/epoch-cache';
import { SimulationOverridesBuilder, type SimulationOverridesPlan } from '@aztec/ethereum/contracts';
import { maxBigint, minBigint } from '@aztec/foundation/bigint';
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
import { InterruptError, TimeoutError } from '@aztec/foundation/error';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { filter } from '@aztec/foundation/iterator';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { InterruptibleSleep } from '@aztec/foundation/sleep';
import { type DateProvider, Timer, executeTimeout } from '@aztec/foundation/timer';
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
  MaliciousYParityCommitteeAttestationsAndSigners,
  type ProposedCheckpointSink,
  type ValidateCheckpointResult,
} from '@aztec/stdlib/block';
import {
  type Checkpoint,
  type ProposedCheckpointData,
  buildCheckpointSimulationOverridesPlan,
  getPreviousCheckpointInboxRollingHash,
  getPreviousCheckpointOutHashes,
  validateCheckpoint,
} from '@aztec/stdlib/checkpoint';
import { computeQuorum, getTimestampForSlot } from '@aztec/stdlib/epoch-helpers';
import { Gas } from '@aztec/stdlib/gas';
import {
  type BlockBuilderOptions,
  InsufficientValidTxsError,
  type MerkleTreeWriteOperations,
  type ResolvedSequencerConfig,
  type WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import {
  type InboxMessagePosition,
  InboxMessagePrefixRef,
  type InboxMessageRange,
  type L1ToL2MessageSource,
} from '@aztec/stdlib/messaging';
import type {
  BlockProposal,
  BlockProposalOptions,
  CheckpointAttestation,
  CheckpointProposal,
  CheckpointProposalOptions,
  CoordinationSignatureContext,
} from '@aztec/stdlib/p2p';
import { orderAttestations, trimAttestations } from '@aztec/stdlib/p2p';
import type { CheckpointHeader } from '@aztec/stdlib/rollup';
import type { L2BlockBuiltStats } from '@aztec/stdlib/stats';
import type { ProposerTimetable } from '@aztec/stdlib/timetable';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { type FailedTx, Tx } from '@aztec/stdlib/tx';
import { AttestationTimeoutError } from '@aztec/stdlib/validators';
import { Attributes, type Traceable, type Tracer, trackSpan } from '@aztec/telemetry-client';
import { CheckpointBuilder, type FullNodeCheckpointsBuilder, type ValidatorClient } from '@aztec/validator-client';
import { DutyAlreadySignedError, SlashingProtectionError } from '@aztec/validator-ha-signer/errors';

import type { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';
import type { InvalidateCheckpointRequest, SequencerPublisher } from '../publisher/sequencer-publisher.js';
import type { CheckpointProposalJobMetricsRecorder } from './checkpoint_proposal_job_metrics.js';
import { CheckpointVoter } from './checkpoint_voter.js';
import { SequencerInterruptedError } from './errors.js';
import type { SequencerEvents } from './events.js';
import {
  type InboxEndpointResolver,
  PROTOCOL_INBOX_CONSUMPTION_CAPS,
  getEndpointUpperBound,
  mustQueryEndpoint,
  resolveEndpoint,
  selectOrdinaryMessageEnd,
  selectSafeLocalEnd,
} from './inbox_message_selection.js';
import type { SequencerMetrics } from './metrics.js';
import type { RequestsTracker } from './requests_tracker.js';
import type { SequencerRollupConstants } from './types.js';
import { SequencerState } from './utils.js';

/** How much time to sleep while waiting for min transactions to accumulate for a block */
const TXS_POLLING_MS = 500;
const ARCHIVER_SYNC_POLLING_MS = 200;
/** Cap on the Inbox endpoint read a block makes near the checkpoint cap, well under a sub-slot. */
const INBOX_ENDPOINT_READ_TIMEOUT_MS = 2_000;

/** An empty transaction stream, for a block built over Inbox messages alone. */
async function* noTransactions(): AsyncGenerator<Tx> {}

/** An integrated preflight did not deliver a usable verdict before the deadline of the phase it serves. */
class PreflightDeadlineError extends Error {
  constructor(public readonly deadline: Date) {
    super(`Checkpoint preflight did not complete before its deadline at ${deadline.toISOString()}`);
    this.name = 'PreflightDeadlineError';
  }
}

/** Result from proposeCheckpoint when a checkpoint was successfully built and broadcast. */
type CheckpointProposalBroadcast = {
  checkpoint: Checkpoint;
  proposal: CheckpointProposal;
  blockProposedAt: number;
  /** The checkpoint's final streaming state, for the pre-publication preflight. */
  streamingState: StreamingCheckpointState;
};

/** Result after attestation collection and signing, ready for L1 submission. */
type CheckpointProposalResult = {
  checkpoint: Checkpoint;
  attestations: CommitteeAttestationsAndSigners;
  attestationsSignature: Signature;
  /** Sequence number of the Inbox bucket the checkpoint's rolling hash corresponds to; the L1 `propose` lookup aid. */
  bucketHint: bigint;
};

/**
 * Running state of streaming Inbox message consumption across the blocks of one checkpoint. Consumption starts from
 * the parent checkpoint's consumed message prefix and advances one block at a time, greedily on the local log while
 * the step stays clear of the checkpoint cap and against a live L1 bucket end once it does not. Nothing about the
 * endpoint is retained between blocks: every attempt decides again from the cursor and the current view.
 */
type StreamingCheckpointState = {
  /** Cumulative Inbox message count consumed as of the parent checkpoint; the per-checkpoint cap origin (fixed). */
  checkpointStartTotalMsgCount: bigint;
  /** The message prefix consumed so far (the parent checkpoint's at the first block); advances as blocks consume. */
  cursor: InboxMessagePosition;
};

/** What a block's streaming message selection decided. */
type StreamingBundleSelection =
  | {
      /** Build the block over this range; the block signs `range.end` as its prefix reference. */
      kind: 'consume';
      range: InboxMessageRange;
    }
  | {
      /** No checkpoint ending this way can be published; give up the slot without signing anything more. */
      kind: 'abort';
      reason: string;
      context?: Record<string, unknown>;
    };

/**
 * Outcome of the block-building loop: the blocks built for the checkpoint, or an abort that discards them all. An
 * abort has already been reported (checkpoint event, warning and metric); the caller only has to give up the slot.
 */
type BlockBuildingResult =
  | {
      aborted: false;
      blocksInCheckpoint: L2Block[];
      /** The last block's proposal, held back to travel with the checkpoint proposal instead of being gossiped. */
      blockPendingBroadcast: BlockProposal | undefined;
    }
  | { aborted: true };

/**
 * Handles the execution of a checkpoint proposal after the initial preparation phase.
 * This includes building blocks, collecting attestations, and publishing the checkpoint to L1,
 * as well as enqueueing votes for slashing and governance proposals. This class is created from
 * the Sequencer once the check for being the proposer for the slot has succeeded.
 */
export class CheckpointProposalJob implements Traceable {
  protected readonly log: Logger;
  private readonly checkpointEventLog: Logger;

  private readonly interruptibleSleep = new InterruptibleSleep();
  private interrupted = false;

  /**
   * Chain state overrides built once per slot in proposeCheckpoint after the checkpoint is
   * complete. Carries the pending parent override (archive + slot + fee header) for pipelining,
   * or the invalidation pending override when rolling back. Consumed by the pre-gossip
   * publisher.validateCheckpointHeaderAndInbox preflight.
   */
  private checkpointSimulationOverridesPlan?: SimulationOverridesPlan;

  private getSignatureContext(): CoordinationSignatureContext {
    return this.signatureContext;
  }

  constructor(
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
    private readonly inbox: InboxEndpointResolver,
    private readonly l2BlockSource: L2BlockSource,
    private readonly checkpointsBuilder: FullNodeCheckpointsBuilder,
    private readonly blockSink: L2BlockSink & ProposedCheckpointSink,
    private readonly l1Constants: SequencerRollupConstants,
    private readonly signatureContext: CoordinationSignatureContext,
    protected config: ResolvedSequencerConfig,
    protected timetable: ProposerTimetable,
    private readonly slasherClient: SlasherClientInterface | undefined,
    private readonly epochCache: EpochCache,
    private readonly dateProvider: DateProvider,
    private readonly metrics: SequencerMetrics,
    private readonly checkpointMetrics: CheckpointProposalJobMetricsRecorder,
    protected readonly eventEmitter: TypedEventEmitter<SequencerEvents>,
    // Shared with the owning sequencer, which drains it during shutdown; the fire-and-forget L1
    // submission this job backgrounds is tracked here rather than in a job-local tracker.
    protected readonly pendingRequests: RequestsTracker,
    private readonly setStateFn: (state: SequencerState, slot: SlotNumber) => void,
    public readonly tracer: Tracer,
    bindings?: LoggerBindings,
    private readonly proposedCheckpointData?: ProposedCheckpointData,
  ) {
    this.log = createLogger('sequencer:checkpoint-proposal', {
      ...bindings,
      instanceId: `slot-${this.getBuildSlot()}`,
    });
    this.checkpointEventLog = createLogger('sequencer:checkpoint-events', {
      ...bindings,
      instanceId: `slot-${this.getBuildSlot()}`,
    });
  }

  /**
   * The wall-clock slot during which this job builds, i.e. the slot one before {@link targetSlot} under
   * proposer pipelining. Also the slot of the parent checkpoint this job builds on top of.
   */
  private getBuildSlot(): SlotNumber {
    return SlotNumber(this.targetSlot - PROPOSER_PIPELINING_SLOT_OFFSET);
  }

  /**
   * Sets the sequencer state for this job, reporting the target slot the checkpoint is being proposed for
   * (not the wall-clock build slot). The slot is informational on the event payload/metrics; the job knows
   * its own target slot, so callers only pass the state.
   */
  private setState(state: SequencerState): void {
    this.setStateFn(state, this.targetSlot);
  }

  /** Interrupts job-owned waits, including the publisher's send-at-slot sleep, so shutdown can finish. */
  public interrupt(): void {
    this.interrupted = true;
    this.interruptibleSleep.interrupt(true);
    this.publisher.interrupt();
  }

  private async awaitInterruptibleSleep(ms: number): Promise<void> {
    if (this.interrupted) {
      throw new SequencerInterruptedError();
    }
    if (ms <= 0) {
      return;
    }
    try {
      await this.interruptibleSleep.sleep(ms);
    } catch (err) {
      if (err instanceof InterruptError) {
        throw new SequencerInterruptedError();
      }
      throw err;
    }
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
        this.pendingRequests.trackRequest(this.publisher.sendRequestsAt(this.targetSlot), () => this.interrupt());
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
    this.pendingRequests.trackRequest(this.waitForAttestationsAndEnqueueSubmissionAsync(broadcast, votesPromises), () =>
      this.interrupt(),
    );

    // Return the built checkpoint immediately — the work loop is now unblocked
    return checkpoint;
  }

  /**
   * Background pipeline: collects attestations, signs them, enqueues the checkpoint, and submits to L1.
   * Runs as a fire-and-forget task tracked in the sequencer's shared tracker so the work loop is unblocked.
   */
  private async waitForAttestationsAndEnqueueSubmissionAsync(
    broadcast: CheckpointProposalBroadcast,
    votesPromises: Promise<unknown>[],
  ): Promise<void> {
    const { checkpoint, streamingState } = broadcast;

    try {
      // Wait for all votes actions, enqueued at the beginning, to resolve
      await Promise.all(votesPromises);

      // Try to collect attestations from the committee
      const signedAttestations = await this.getSignedCommitteeAttestations(broadcast);

      // Wait for the previous checkpoint to land on L1 before submitting, so we can check it
      // matches the proposed checkpoint we used as parent, and has valid attestations.
      if (signedAttestations && (await this.waitForValidParentCheckpointOnL1())) {
        // Attestation collection took seconds and L1 may have moved: re-run the integrated header and Inbox
        // preflight against L1's current state, and take the bucket hint from it.
        const bucketHint = await this.preflightBeforePublication(checkpoint.header, streamingState);
        if (bucketHint !== undefined && (await this.checkpointBlocksAreStillLocal(checkpoint))) {
          await this.enqueueCheckpointForSubmission({ checkpoint, ...signedAttestations, bucketHint });
        }
      }

      // If we failed to collect attestations, at least check if we need to issue an invalidation
      if (!signedAttestations && (await this.waitForSyncedL2SlotNumber(this.getBuildSlot()))) {
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
        this.metrics.recordPipelineDiscard();
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
      this.metrics.recordPipelineDiscard();
    }
  }

  /**
   * Runs the integrated header and Inbox preflight immediately before publication, against L1's current Rollup
   * storage plus the operations this job's bundle applies before the propose (an invalidation forcing the pending tip
   * back). The pre-gossip overrides that bridged the unpublished parent are not carried over, since the parent has
   * been confirmed on L1 by now. The one assumption that is carried over is the build's proven pin while a prune is
   * due at the target slot: the verdict is then conditional on the epoch proof landing by the target slot, which is
   * the same assumption the build made and which `propose` itself validates.
   *
   * Returns the live bucket sequence to publish as the unsigned `propose` hint, or undefined when the checkpoint can
   * no longer be published, in which case the slot is abandoned without touching the signed contents.
   */
  private async preflightBeforePublication(
    header: CheckpointHeader,
    streamingState: StreamingCheckpointState,
  ): Promise<bigint | undefined> {
    const overridesPlan = await this.getPublicationSimulationOverridesPlan();
    try {
      return await this.preflightWithinDeadline(header, streamingState, overridesPlan, this.getL1PublishDeadline());
    } catch (err) {
      if (err instanceof SequencerInterruptedError) {
        throw err;
      }
      const reason =
        err instanceof PreflightDeadlineError ? 'publication_preflight_timeout' : 'publication_preflight_failed';
      const context = {
        slot: this.targetSlot,
        checkpointNumber: this.checkpointNumber,
        consumedTotalMsgCount: streamingState.cursor.totalMessageCount,
        inboxRollingHash: header.inboxRollingHash.toString(),
        reason,
        error: err instanceof Error ? err.message : String(err),
      };
      this.logCheckpointEvent('publish-failed', `Checkpoint publish failed for slot ${this.targetSlot}`, context);
      this.log.warn(
        `Pre-publication header and Inbox preflight did not clear the checkpoint; abandoning slot ${this.targetSlot}`,
        context,
      );
      this.metrics.recordCheckpointProposalFailed(reason);
      this.eventEmitter.emit('checkpoint-publish-failed', { slot: this.targetSlot });
      return undefined;
    }
  }

  /**
   * Runs the integrated header and Inbox preflight within what remains of `deadline`. The simulation is abandoned
   * once the phase it serves has run out of time, and a verdict arriving after the deadline, or after the job was
   * interrupted, is not acted on: signing or enqueueing on it would commit this node past the point at which the
   * checkpoint can still land.
   */
  private async preflightWithinDeadline(
    header: CheckpointHeader,
    streamingState: StreamingCheckpointState,
    overridesPlan: SimulationOverridesPlan | undefined,
    deadline: Date,
  ): Promise<bigint> {
    const remainingMs = deadline.getTime() - this.dateProvider.now();
    if (remainingMs <= 0) {
      throw new PreflightDeadlineError(deadline);
    }
    const bucketHint = await executeTimeout(
      () =>
        this.publisher.validateCheckpointHeaderAndInbox(
          header,
          {
            expectedTotal: streamingState.cursor.totalMessageCount,
            expectedParentCheckpointNumber: CheckpointNumber(this.checkpointNumber - 1),
          },
          overridesPlan,
        ),
      remainingMs,
      () => new PreflightDeadlineError(deadline),
    );
    if (this.interrupted) {
      throw new SequencerInterruptedError();
    }
    if (this.dateProvider.now() >= deadline.getTime()) {
      throw new PreflightDeadlineError(deadline);
    }
    return bucketHint;
  }

  /**
   * The latest moment at which the checkpoint proposal can still gather attestations: the single consensus
   * `attestation_deadline` (`target_slot_start + S - 2E`). Nothing signed after it can be attested to.
   */
  private getAttestationDeadline(): Date {
    return new Date(this.timetable.getAttestationDeadline(this.targetSlot) * 1000);
  }

  /**
   * The latest moment at which this proposal may still be sent: the consensus receive deadline less one propagation
   * budget. Everything on the path to `broadcastCheckpointProposal` — the pre-gossip preflight, signing, the local
   * archiver insertion — is budgeted against it, because a proposal that leaves this node later than this is refused
   * on ingress by every peer. This is deliberately tighter than {@link getAttestationDeadline}, which bounds
   * attestation collection, and than {@link getL1PublishDeadline}, which bounds the send.
   */
  private getProposalSendDeadline(): Date {
    return new Date(this.timetable.getCheckpointProposalSendDeadline(this.targetSlot) * 1000);
  }

  /**
   * Whether there is still time to gossip this slot's proposal. Signing may be remote (HA) and the archiver insertion
   * resolves through a queue, so neither is guaranteed to be quick; a timer wrapped around the preflight alone does
   * not cover them. Callers re-check before each further side effect, and abandon the send rather than starting one
   * that peers will refuse. An already-produced signature and its duty record are left untouched.
   */
  private reportSendBudgetExpired(stage: string, deadline: Date): void {
    const context = {
      slot: this.targetSlot,
      checkpointNumber: this.checkpointNumber,
      stage,
      deadline: deadline.toISOString(),
      reason: 'proposal_send_timeout',
    };
    this.log.warn(
      `Checkpoint proposal for slot ${this.targetSlot} missed the proposal send deadline during ${stage}; ` +
        `not gossiping it`,
      context,
    );
    this.metrics.recordCheckpointProposalFailed('proposal_send_timeout');
    this.eventEmitter.emit('header-validation-failed', {
      slot: this.targetSlot,
      checkpointNumber: this.checkpointNumber,
      reason: `proposal send deadline ${deadline.toISOString()} passed during ${stage}`,
    });
  }

  /**
   * Latest L1 block the propose can still land in for the target slot: the last Ethereum block inside the target slot
   * (`target_slot_start + S - E`). This is one ethereum slot later than `attestation_deadline`, which bounds when
   * validators must have signed, not when the proposer must have sent. Using the attestation deadline here is too
   * tight: attestations are collected up to (and, when not enforcing, past) it, so the propose tx would be enqueued
   * already expired and time out before it can mine.
   */
  private getL1PublishDeadline(): Date {
    const lastL1BlockInTargetSlot =
      Number(getTimestampForSlot(this.targetSlot, this.l1Constants)) +
      this.l1Constants.slotDuration -
      this.l1Constants.ethereumSlotDuration;
    return new Date(lastL1BlockInTargetSlot * 1000);
  }

  /**
   * The state overrides for the pre-publication preflight: only what the send will actually observe that the current
   * L1 state does not show. An invalidation enqueued for this slot forces the pending tip back before the propose
   * executes, so the preflight must see that tip. The build pinned the proven tip so that a prune due at the target
   * slot would not collapse the parent in simulation, on the standing assumption that the epoch proof lands by then;
   * `propose` itself is what validates that assumption, so while the proof is still outstanding the same pin is kept
   * here rather than letting the preflight abandon a checkpoint the send may well land. The unlanded-parent overrides
   * (archive, fee header, parent cell) are not carried over: the parent has been confirmed on L1 by now.
   *
   * Under the test-only `skipWaitForValidParentCheckpointOnL1` the parent was never confirmed on L1, so the build-time
   * plan describing it is reused; that keeps the hypothetical context the test asked for and is not a production path.
   */
  private async getPublicationSimulationOverridesPlan(): Promise<SimulationOverridesPlan | undefined> {
    if (this.config.skipWaitForValidParentCheckpointOnL1) {
      return this.checkpointSimulationOverridesPlan;
    }
    const builder = new SimulationOverridesBuilder();
    if (this.invalidateCheckpoint && !this.config.skipInvalidateBlockAsProposer) {
      builder.withChainTips({ pending: this.invalidateCheckpoint.forcePendingCheckpointNumber });
    }
    const provenPin = this.checkpointSimulationOverridesPlan?.chainTipsOverride?.proven;
    if (provenPin !== undefined && (await this.l2BlockSource.isPruneDueAtSlot(this.targetSlot))) {
      this.log.warn(
        `Assuming proof for epoch ending at checkpoint ${provenPin} lands by target slot ${this.targetSlot} for the publication preflight`,
        { slot: this.targetSlot, checkpointNumber: this.checkpointNumber, provenOverride: provenPin },
      );
      builder.withChainTips({ proven: provenPin });
    }
    return builder.build();
  }

  /**
   * Whether the local archiver still holds the last block of the checkpoint about to be published, under the hash it
   * was built with. Attestation collection takes seconds, and the archiver can drop the proposed blocks in that
   * window: the end-of-slot prune takes every block of a slot that closed without a checkpoint, a checkpoint seen on
   * L1 that conflicts with the local chain prunes the blocks it disagrees with, and an L1 reorg that replaced the
   * messages the blocks consumed prunes them too. Publishing blocks this node no longer holds would put a checkpoint
   * on L1 that its own archiver cannot serve.
   *
   * The hash is compared rather than the height alone, since a chain rebuilt after a prune reuses the block numbers.
   *
   * This is a preflight, not a guarantee: the proposal is enqueued here and only broadcast once the publisher's wait
   * for the target slot returns, and the archiver can prune in that window as it can after the transaction is sent.
   * What the check buys is the common case, where the prune is already visible by the time the slot arrives.
   *
   * Skipped whenever proposed blocks aren't pushed (`skipPushProposedBlocksToArchiver`, fisherman mode): the archiver
   * never held them in the first place, so their absence says nothing about a prune.
   */
  private async checkpointBlocksAreStillLocal(checkpoint: Checkpoint): Promise<boolean> {
    if (this.config.skipPushProposedBlocksToArchiver || this.config.fishermanMode) {
      return true;
    }
    const lastBlock = checkpoint.blocks.at(-1);
    if (lastBlock === undefined) {
      return true;
    }
    const blockHash = await lastBlock.hash();
    const local = await this.l2BlockSource.getBlockData({ number: lastBlock.number });
    if (local !== undefined && local.blockHash.equals(blockHash)) {
      return true;
    }

    const context = {
      slot: this.targetSlot,
      checkpointNumber: this.checkpointNumber,
      blockNumber: lastBlock.number,
      blockHash: blockHash.toString(),
      localBlockHash: local?.blockHash.toString(),
      reason: 'checkpoint_blocks_pruned',
    };
    this.logCheckpointEvent('publish-failed', `Checkpoint publish failed for slot ${this.targetSlot}`, context);
    this.log.warn(
      `The local archiver no longer holds the blocks of this checkpoint; abandoning slot ${this.targetSlot} rather ` +
        `than publishing a checkpoint this node cannot serve`,
      context,
    );
    this.metrics.recordCheckpointProposalFailed('checkpoint_blocks_pruned');
    return false;
  }

  /** Enqueues the checkpoint for L1 submission. Called after pipeline sleep in execute(). */
  private async enqueueCheckpointForSubmission(result: CheckpointProposalResult): Promise<void> {
    const { checkpoint, attestations, attestationsSignature, bucketHint } = result;

    this.setState(SequencerState.PUBLISHING_CHECKPOINT);
    const txTimeoutAt = this.getL1PublishDeadline();

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

    await this.publisher.enqueueProposeCheckpoint(checkpoint, attestations, attestationsSignature, bucketHint, {
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
      const timer = new Timer();
      while (true) {
        const syncedSlot = await this.l2BlockSource.getSyncedL2SlotNumber();
        if (syncedSlot !== undefined && syncedSlot >= waitForSlot) {
          return true;
        }
        if (timeoutSeconds && timer.s() > timeoutSeconds) {
          throw new TimeoutError(`Timeout awaiting archiver sync past slot ${waitForSlot}`);
        }
        await this.awaitInterruptibleSleep(ARCHIVER_SYNC_POLLING_MS);
      }
    } catch (err) {
      if (err instanceof SequencerInterruptedError) {
        throw err;
      }
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
    if (this.config.skipWaitForValidParentCheckpointOnL1) {
      this.log.warn(`Skipping waitForValidParentCheckpointOnL1 due to test configuration`, {
        checkpointNumber: this.checkpointNumber,
      });
      return true;
    }

    const parentCheckpointNumber = CheckpointNumber(this.checkpointNumber - 1);

    // Wait until archiver has synced L1 past the parent's slot (the build slot, one before targetSlot)
    if (!(await this.waitForSyncedL2SlotNumber(this.getBuildSlot()))) {
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
      if (this.proposedCheckpointData) {
        // Measure against the wall-clock slot whose build window we are currently using.
        // In pipelining mode `targetSlot` is intentionally one slot ahead, which makes the
        // target-slot boundary a full slot away from the actual build start time.
        const slotBoundaryMs = Number(getTimestampForSlot(this.getBuildSlot(), this.l1Constants)) * 1000;
        this.checkpointMetrics.recordPipelinedCheckpointBuildStartOffsetFromSlotBoundary(now - slotBoundaryMs);
      }
      this.checkpointMetrics.startCheckpointTiming(now);

      // Get operator configured coinbase and fee recipient for this attestor
      const coinbase = this.validatorClient.getCoinbaseForAttestor(this.attestorAddress);
      const feeRecipient = this.validatorClient.getFeeRecipientForAttestor(this.attestorAddress);

      // Start the checkpoint
      this.setState(SequencerState.INITIALIZING_CHECKPOINT);
      this.logCheckpointEvent('slot-started', `Starting checkpoint proposal for slot ${this.targetSlot}`, {
        buildSlot: this.getBuildSlot(),
        submissionSlot: this.targetSlot,
        slot: this.targetSlot,
        checkpointNumber: this.checkpointNumber,
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
      // mana-min-fee simulation (in the globals builder) and the pre-gossip
      // validateCheckpointHeaderAndInbox preflight see the chain tip the eventual L1 send will see.
      this.checkpointSimulationOverridesPlan = await buildCheckpointSimulationOverridesPlan({
        checkpointNumber: this.checkpointNumber,
        proposedCheckpointData: this.proposedCheckpointData,
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
        pipeliningEnabled: true,
        proposedCheckpointData: this.proposedCheckpointData,
        log: this.log,
      });

      // Chain start for this checkpoint's inbox rolling hash: the parent checkpoint's `inboxRollingHash`. Unlike the
      // epoch out-hash tree, the chain is continuous across epochs, so this is always the immediately preceding
      // checkpoint's value (or zero at genesis).
      const previousInboxRollingHash = await getPreviousCheckpointInboxRollingHash({
        blockSource: this.l2BlockSource,
        checkpointNumber: this.checkpointNumber,
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

      // Streaming Inbox: the consumption cursor starts at the parent state this checkpoint builds on. The fork's
      // L1-to-L2 tree leaf count is the parent's cumulative consumed total (compact indexing), whose prefix hash the
      // local message log serves.
      const streamingState = await this.resolveStreamingCheckpointStart(fork);

      // Create checkpoint builder for the entire slot
      const checkpointBuilder = await this.checkpointsBuilder.startCheckpoint(
        this.checkpointNumber,
        checkpointGlobalVariables,
        feeAssetPriceModifier,
        previousCheckpointOutHashes,
        previousInboxRollingHash,
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
          blockProposalOptions,
          streamingState,
        );
        if (result.aborted) {
          return undefined;
        }
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
      this.setState(SequencerState.ASSEMBLING_CHECKPOINT);
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
        this.log.error(`Built an invalid checkpoint at slot ${this.targetSlot} (skipping proposal)`, err, {
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
        buildSlot: this.getBuildSlot(),
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
        // Return a broadcast result with a dummy proposal — fisherman mode skips attestation collection and never
        // publishes.
        return { checkpoint, proposal: undefined!, blockProposedAt: this.dateProvider.now(), streamingState };
      }

      // Validate the header and the Inbox consumption against L1 state before broadcasting: the parent the header
      // builds on, the final message position resolving to a live bucket, and L1's settlement, cap and censorship
      // rules. If this fails the slot is aborted before any gossip work. The pipelined parent is supplied through
      // the simulation overrides, so this verdict is conditional on that parent landing; the pre-publication
      // preflight repeats it once the parent has landed, keeping only the assumptions still outstanding then.
      // The simulation is bounded by the proposal send deadline, not the attestation deadline: a verdict arriving
      // once peers have stopped accepting proposals for this slot must not lead to signing and gossiping one.
      const sendDeadline = this.getProposalSendDeadline();
      try {
        await this.preflightWithinDeadline(
          checkpoint.header,
          streamingState,
          this.checkpointSimulationOverridesPlan,
          sendDeadline,
        );
      } catch (err) {
        if (err instanceof SequencerInterruptedError) {
          return undefined;
        }
        const reason = err instanceof PreflightDeadlineError ? 'header_validation_timeout' : 'header_validation_failed';
        this.log.error(`Pre-broadcast header and Inbox validation failed for slot ${this.targetSlot}; aborting`, err, {
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          consumedTotalMsgCount: streamingState.cursor.totalMessageCount,
          inboxRollingHash: checkpoint.header.inboxRollingHash.toString(),
          reason,
        });
        this.metrics.recordCheckpointProposalFailed(reason);
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

      // Signing may be remote (HA), so the preflight's own budget check does not cover it. Stop here rather than
      // start the archiver insertion for a proposal no peer will accept; the signature and its duty record stand.
      if (this.dateProvider.now() >= sendDeadline.getTime()) {
        this.reportSendBudgetExpired('signing', sendDeadline);
        return undefined;
      }

      // Advance our own optimistic proposed-checkpoint tip locally before gossiping. Gossipsub
      // doesn't echo our own messages back, so this is how the proposer makes its own proposed
      // checkpoint visible for pipelining the next slot. Built from local checkpoint data — never
      // from the broadcast proposal archive, which may be deliberately corrupted under test flags.
      // Fail closed: if this throws, the outer catch aborts the slot before gossiping.
      await this.syncProposedCheckpointToArchiver(checkpoint, blocksInCheckpoint.length, feeAssetPriceModifier);

      // The insertion resolves through the archiver's queue, so re-check immediately before the broadcast itself.
      // The local tip stays advanced: it is this node's own optimistic state, not something peers acted on.
      if (this.dateProvider.now() >= sendDeadline.getTime()) {
        this.reportSendBudgetExpired('archiver insertion', sendDeadline);
        return undefined;
      }

      const blockProposedAt = this.dateProvider.now();
      if (this.config.skipBroadcastCheckpointProposal) {
        // Test-only: suppress the CheckpointProposal so peers never see a proposed checkpoint for
        // this slot, but still broadcast the held last block standalone so peers' archivers ingest
        // it as a proposed-but-uncheckpointed tip — the exact orphan-block state that
        // pruneOrphanProposedBlocks / checkSync must handle.
        if (blockPendingBroadcast && !this.config.skipBroadcastProposals) {
          await this.p2pClient.broadcastProposal(blockPendingBroadcast);
        }
      } else if (!this.config.skipBroadcastProposals) {
        await this.p2pClient.broadcastCheckpointProposal(proposal);
        this.checkpointMetrics.noteCheckpointBroadcast(this.dateProvider.now());
      }

      // Return immediately after broadcast — attestation collection happens in the background.
      return { checkpoint, proposal, blockProposedAt, streamingState };
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
    blockProposalOptions: BlockProposalOptions,
    streamingState: StreamingCheckpointState,
  ): Promise<BlockBuildingResult> {
    const blocksInCheckpoint: L2Block[] = [];
    const txHashesAlreadyIncluded = new Set<string>();
    const initialBlockNumber = BlockNumber(this.syncedToBlockNumber + 1);

    // Last block in the checkpoint will usually be flagged as pending broadcast, so we send it along with the checkpoint proposal
    let blockPendingBroadcast: BlockProposal | undefined = undefined;
    // Streaming Inbox: the loop ran out of sub-slots rather than finishing the checkpoint, so the cursor may be
    // sitting at a prefix that is not a live L1 bucket end.
    let ranOutOfSubslots = false;

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

      const nowSeconds = this.dateProvider.now() / 1000;
      const timingInfo = this.timetable.selectNextSubslot(this.targetSlot, nowSeconds);

      if (!timingInfo.canStart) {
        this.log.debug(`Not enough time left in slot to start another block`, {
          slot: this.targetSlot,
          blocksBuilt,
          nowSeconds,
        });
        ranOutOfSubslots = true;
        break;
      }

      // Streaming Inbox: select this block's message range against the current (not-yet-advanced) consumption
      // cursor. The state is only advanced once the block builds successfully, so a failed build (retried in a
      // later sub-slot) re-derives the range rather than losing it. The builder inserts the messages and rolls them
      // back with the fork on failure. The endpoint must be reached by whichever block ends the checkpoint, which
      // includes the block that reaches the per-checkpoint block cap, not just the timetable's last sub-slot.
      const maxBlocks = Math.min(this.config.maxBlocksPerCheckpoint, this.timetable.getMaxBlocksPerCheckpoint());
      const isCheckpointFinalBlock = timingInfo.isLastBlock || blocksBuilt + 1 >= maxBlocks;
      const selection = await this.selectStreamingBundle(streamingState, {
        isFinalBlock: isCheckpointFinalBlock,
        buildDeadline: timingInfo.deadline,
      });

      // No checkpoint ending on the messages this block could consume can be published: stop before signing
      // anything more and give up the slot.
      if (selection.kind === 'abort') {
        this.reportStreamingAbort(streamingState, selection.reason, {
          blocksBuilt,
          blockNumber,
          ...selection.context,
        });
        return { aborted: true };
      }

      const streamingBundle = selection.range.messages;

      const buildResult = await this.buildSingleBlock(checkpointBuilder, {
        // Create all blocks with the same timestamp
        blockTimestamp: timestamp,
        // Create an empty block if we haven't already and this is the last one
        forceCreate: timingInfo.isLastBlock && blocksBuilt === 0 && this.config.buildCheckpointIfEmpty,
        buildDeadline: new Date(timingInfo.deadline * 1000),
        blockNumber,
        indexWithinCheckpoint,
        txHashesAlreadyIncluded,
        l1ToL2Messages: streamingBundle,
      });

      // If we failed to build the block due to insufficient txs, we try again if there is still time left in the slot
      if ('failure' in buildResult) {
        // If this was the last subslot, we're done.
        if (timingInfo.isLastBlock) {
          break;
        }
        // Waiting out a whole sub-slot is subject to the same budget as waiting out a tx poll, and is longer: once
        // the proposal can no longer be sent, another attempt cannot produce a block any peer would accept, and the
        // wait would take the checkpoint we already have past the deadline with it.
        if (this.getProposalSendDeadline().getTime() - this.dateProvider.now() < TXS_POLLING_MS) {
          this.log.verbose(
            `Not waiting for another sub-slot in slot ${this.targetSlot}: the proposal send deadline is too close`,
            { slot: this.targetSlot, checkpointNumber: this.checkpointNumber, blocksBuilt },
          );
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

      // Streaming Inbox: the block built successfully, so advance the cursor to the prefix it consumed through and
      // sign that prefix as this block's reference. A block that consumed nothing re-signs the cursor's prefix.
      streamingState.cursor = selection.range.end;
      const blockPrefixRef = InboxMessagePrefixRef.fromPosition(streamingState.cursor);

      // Sign the block proposal. This will throw if HA signing fails.
      const proposal = await this.createBlockProposal(
        block,
        usedTxs,
        {
          ...blockProposalOptions,
          broadcastInvalidBlockProposal:
            blockProposalOptions.broadcastInvalidBlockProposal ||
            block.indexWithinCheckpoint === this.config.invalidBlockProposalIndexWithinCheckpoint,
        },
        blockPrefixRef,
      );

      // Sync the proposed block to the archiver to make it available, only after we've managed to sign the proposal,
      // so we avoid polluting our archive with a block that would fail.
      // We wait for the sync to succeed, as this helps catch consistency errors, even if it means we lose some time for block-building.
      // If this throws, we abort the entire checkpoint.
      await this.syncProposedBlockToArchiver(block, blockPrefixRef);

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

    // Streaming Inbox: the sub-slot schedule ran out mid-checkpoint, so the cursor may sit at a prefix that is not a
    // live L1 bucket end, which no checkpoint can be published on. Resolve once and, if it is not one, build one more
    // block rather than lose the slot; this is the only place the loop overrides the timetable. A cursor still at the
    // checkpoint start needs nothing: the parent checkpoint already ended on a live bucket end.
    if (
      ranOutOfSubslots &&
      blocksInCheckpoint.length > 0 &&
      streamingState.cursor.totalMessageCount > streamingState.checkpointStartTotalMsgCount
    ) {
      const forced = await this.buildForcedEndpointBlock(checkpointBuilder, streamingState, {
        blockTimestamp: timestamp,
        blockNumber: BlockNumber(initialBlockNumber + blocksInCheckpoint.length),
        indexWithinCheckpoint: IndexWithinCheckpoint(blocksInCheckpoint.length),
        txHashesAlreadyIncluded,
        blockProposalOptions,
      });
      if (forced !== undefined) {
        if ('aborted' in forced) {
          return { aborted: true };
        }
        blocksInCheckpoint.push(forced.block);
        blockPendingBroadcast = forced.proposal;
      }
    }

    this.log.verbose(`Block building loop completed for slot ${this.targetSlot}`, {
      slot: this.targetSlot,
      blocksBuilt: blocksInCheckpoint.length,
    });

    return { aborted: false, blocksInCheckpoint, blockPendingBroadcast };
  }

  /**
   * Ends the checkpoint at a live L1 bucket end with one extra message-only block, after the sub-slot schedule ran
   * out mid-checkpoint. Resolves the endpoint the way the checkpoint's final block would; when the cursor already is
   * one, nothing is built and the checkpoint publishes as it stands. The block carries no transactions: it is
   * already past the schedule, so it must not spend its remaining time executing any.
   *
   * Returns the block and its signed proposal, `undefined` when no block was needed, or an abort when the checkpoint
   * has to be abandoned. The abort is already reported.
   */
  private async buildForcedEndpointBlock(
    checkpointBuilder: CheckpointBuilder,
    streamingState: StreamingCheckpointState,
    opts: {
      blockTimestamp: bigint;
      blockNumber: BlockNumber;
      indexWithinCheckpoint: IndexWithinCheckpoint;
      txHashesAlreadyIncluded: Set<string>;
      blockProposalOptions: BlockProposalOptions;
    },
  ): Promise<{ block: L2Block; proposal: BlockProposal | undefined } | { aborted: true } | undefined> {
    const { cursor, checkpointStartTotalMsgCount: checkpointStartCount } = streamingState;
    const localSyncedCount = (await this.l1ToL2MessageSource.getSyncedMessagePosition()).totalMessageCount;
    const upperBound = getEndpointUpperBound({
      cursorCount: cursor.totalMessageCount,
      localSyncedCount,
      checkpointStartCount,
      isFinalBlock: true,
      caps: PROTOCOL_INBOX_CONSUMPTION_CAPS,
    });
    const { deadline, pastLastBlockBuildTime } = this.getForcedEndpointBlockDeadline();
    this.log.warn(`Ending checkpoint ${this.checkpointNumber} with a forced Inbox endpoint block`, {
      slot: this.targetSlot,
      checkpointNumber: this.checkpointNumber,
      blockNumber: opts.blockNumber,
      cursorTotalMsgCount: cursor.totalMessageCount,
      upperBound,
      deadline: deadline.toISOString(),
      pastLastBlockBuildTime,
    });

    const resolved = await this.resolveEndpointWithinDeadline(cursor, upperBound, deadline.getTime() / 1000);
    if (!resolved.ok) {
      const reason =
        resolved.reason === 'local_prefix_changed' ? 'inbox_prefix_reorged' : 'inbox_completion_unresolved';
      this.reportStreamingAbort(streamingState, reason, {
        phase: 'forced_tail_block',
        cause: resolved.reason,
        upperBound,
        endpointTotal: resolved.endpointTotal,
        localSyncedCount,
      });
      return { aborted: true };
    }
    if (resolved.endpoint.totalMessageCount === cursor.totalMessageCount) {
      this.log.verbose(`Checkpoint ${this.checkpointNumber} already ends at a live Inbox bucket end`, {
        slot: this.targetSlot,
        checkpointNumber: this.checkpointNumber,
        cursorTotalMsgCount: cursor.totalMessageCount,
      });
      return undefined;
    }

    const buildResult = await this.buildSingleBlock(checkpointBuilder, {
      forceCreate: true,
      skipTransactions: true,
      blockTimestamp: opts.blockTimestamp,
      buildDeadline: deadline,
      blockNumber: opts.blockNumber,
      indexWithinCheckpoint: opts.indexWithinCheckpoint,
      txHashesAlreadyIncluded: opts.txHashesAlreadyIncluded,
      l1ToL2Messages: resolved.range.messages,
    });
    if (!('block' in buildResult)) {
      this.reportStreamingAbort(streamingState, 'inbox_completion_unresolved', {
        phase: 'forced_tail_block',
        cause: 'failure' in buildResult ? buildResult.failure : buildResult.error.message,
        endpointTotalMsgCount: resolved.endpoint.totalMessageCount,
      });
      return { aborted: true };
    }

    streamingState.cursor = resolved.range.end;
    const blockPrefixRef = InboxMessagePrefixRef.fromPosition(streamingState.cursor);
    const proposal = await this.createBlockProposal(
      buildResult.block,
      buildResult.usedTxs,
      opts.blockProposalOptions,
      blockPrefixRef,
    );
    await this.syncProposedBlockToArchiver(buildResult.block, blockPrefixRef);
    this.checkpointMetrics.noteCheckpointBlockBuilt(this.dateProvider.now(), {
      isFirstBlock: false,
      isLastBlock: true,
    });
    return { block: buildResult.block, proposal };
  }

  /**
   * Build deadline for the forced endpoint block. The proposer timetable's last block build time already budgets
   * checkpoint preparation and propagation ahead of the receive deadline validators enforce on ingress, so it is the
   * bound. Past it the block is still attempted (a late proposal beats an unpublishable checkpoint), bounded by that
   * receive deadline less one propagation budget. The attestation deadline is a re-execution cutoff and never applies.
   */
  private getForcedEndpointBlockDeadline(): { deadline: Date; pastLastBlockBuildTime: boolean } {
    const lastBlockBuildTime = this.timetable.getLastBlockBuildTime(this.targetSlot);
    if (this.dateProvider.now() / 1000 < lastBlockBuildTime) {
      return { deadline: new Date(lastBlockBuildTime * 1000), pastLastBlockBuildTime: false };
    }
    const hardStop = this.timetable.getCheckpointProposalSendDeadline(this.targetSlot);
    return { deadline: new Date(hardStop * 1000), pastLastBlockBuildTime: true };
  }

  /** Creates a block proposal for a given block via the validator client (unless in fisherman mode) */
  private createBlockProposal(
    block: L2Block,
    usedTxs: Tx[],
    blockProposalOptions: BlockProposalOptions,
    inboxPrefixRef: InboxMessagePrefixRef,
  ): Promise<BlockProposal | undefined> {
    if (this.config.fishermanMode) {
      this.log.info(`Skipping block proposal for block ${block.number} in fisherman mode`);
      return Promise.resolve(undefined);
    }
    return this.validatorClient.createBlockProposal(
      block.header,
      this.checkpointNumber,
      block.indexWithinCheckpoint,
      block.archive.root,
      usedTxs,
      this.proposer,
      inboxPrefixRef,
      blockProposalOptions,
    );
  }

  /**
   * Resolves where a streaming-Inbox checkpoint's consumption starts: the parent checkpoint's consumed message
   * prefix. The parent's cumulative consumed total is the L1-to-L2 message tree leaf count of the fork this
   * checkpoint builds on (compact indexing makes leaf count equal cumulative message count), and the local message
   * log serves the prefix hash at that count. Genesis is the `total = 0` case with a zero hash.
   */
  private async resolveStreamingCheckpointStart(fork: MerkleTreeWriteOperations): Promise<StreamingCheckpointState> {
    const parentInfo = await fork.getTreeInfo(MerkleTreeId.L1_TO_L2_MESSAGE_TREE);
    const parentTotalMsgCount = parentInfo.size;
    const cursor = await this.l1ToL2MessageSource.getMessagePosition(parentTotalMsgCount);
    if (cursor === undefined) {
      throw new Error(
        `Streaming inbox: cannot resolve the Inbox message prefix at cumulative total ${parentTotalMsgCount} ` +
          `(checkpoint ${this.checkpointNumber}); local Inbox view has not synced it`,
      );
    }
    return { checkpointStartTotalMsgCount: parentTotalMsgCount, cursor };
  }

  /**
   * Selects the message range this block consumes. Does not mutate the cursor; the caller advances it only after the
   * block builds successfully.
   *
   * Selection is greedy on the local log: every message the archiver has observed, up to the per-block and
   * checkpoint caps. A block consults L1 only when it is the checkpoint's final block, whose position must be a live
   * L1 bucket end, or when its prospective end would pass the threshold one bucket below the cap and could leave the
   * last legal endpoint behind. The lookup is bounded by the checkpoint cap on a non-final block, so a mandatory
   * bucket beyond this block's own reach is not stranded by a nearer endpoint, and additionally by one block's
   * capacity on the final block. A non-final block then ends at the further of what the lookup allows and the safe
   * local step, so consulting L1 never consumes less than staying below the threshold would have, and it may
   * legitimately end inside a bucket. The final block instead ends exactly on the resolved boundary, so whenever the
   * last live boundary within reach sits behind the safe local step it consumes fewer messages than the local log
   * alone would allow. Nothing is retained: the next attempt decides again.
   *
   * An endpoint that cannot be resolved on a non-final block (local lag, no live endpoint yet) leaves the block with
   * that safe local step and is retried on the next block; on the final block it abandons the checkpoint. A local
   * prefix that no longer matches the cursor means the blocks already signed were built on messages the local log
   * has since replaced, which also abandons the checkpoint.
   */
  private async selectStreamingBundle(
    state: StreamingCheckpointState,
    opts: { isFinalBlock: boolean; buildDeadline: number },
  ): Promise<StreamingBundleSelection> {
    const caps = PROTOCOL_INBOX_CONSUMPTION_CAPS;
    const { cursor, checkpointStartTotalMsgCount: checkpointStartCount } = state;
    const cursorCount = cursor.totalMessageCount;
    const localSyncedCount = (await this.l1ToL2MessageSource.getSyncedMessagePosition()).totalMessageCount;
    const greedyEnd = selectOrdinaryMessageEnd({ cursorCount, localSyncedCount, checkpointStartCount, caps });

    if (
      !mustQueryEndpoint({ prospectiveEnd: greedyEnd, checkpointStartCount, isFinalBlock: opts.isFinalBlock, caps })
    ) {
      return this.readStreamingRange(state, greedyEnd);
    }

    const upperBound = getEndpointUpperBound({
      cursorCount,
      localSyncedCount,
      checkpointStartCount,
      isFinalBlock: opts.isFinalBlock,
      caps,
    });
    const resolved = await this.resolveEndpointWithinDeadline(cursor, upperBound, opts.buildDeadline);
    const safeLocalEnd = selectSafeLocalEnd({ cursorCount, localSyncedCount, checkpointStartCount, caps });
    if (!resolved.ok) {
      if (resolved.reason === 'local_prefix_changed') {
        return { kind: 'abort', reason: 'inbox_prefix_reorged', context: { upperBound } };
      }
      if (opts.isFinalBlock) {
        return {
          kind: 'abort',
          reason: 'inbox_completion_unresolved',
          context: { cause: resolved.reason, upperBound, endpointTotal: resolved.endpointTotal, localSyncedCount },
        };
      }
      this.log.warn(`Streaming Inbox endpoint not resolvable yet, taking the safe local step`, {
        slot: this.targetSlot,
        checkpointNumber: this.checkpointNumber,
        cause: resolved.reason,
        cursorTotalMsgCount: cursorCount,
        localSyncedCount,
        upperBound,
        endpointTotal: resolved.endpointTotal,
        safeLocalEnd,
      });
      return this.readStreamingRange(state, safeLocalEnd);
    }

    const endpointTotal = resolved.endpoint.totalMessageCount;
    const endpointEnd = minBigint(cursorCount + BigInt(caps.perBlockCap), endpointTotal);
    // The final block has to land on the endpoint, so it takes it even when the safe local step reaches further; any
    // other block takes the further of the two, so consulting L1 never consumes less than staying below the
    // threshold would have.
    const end = opts.isFinalBlock ? endpointEnd : maxBigint(safeLocalEnd, endpointEnd);
    this.log.verbose(`Streaming Inbox resolved endpoint ${endpointTotal}, consuming through ${end}`, {
      slot: this.targetSlot,
      checkpointNumber: this.checkpointNumber,
      cursorTotalMsgCount: cursorCount,
      localSyncedCount,
      upperBound,
      endpointTotalMsgCount: endpointTotal,
      bucketSeq: resolved.bucketSeq,
      end,
    });
    // An end short of or past the endpoint needs its own read, so the signed hash is the one at `end` and never the
    // endpoint's; landing exactly on the endpoint reuses the snapshot the resolver already read and checked against
    // the cursor's hash.
    return end === endpointTotal ? { kind: 'consume', range: resolved.range } : this.readStreamingRange(state, end);
  }

  /**
   * Reads the messages from the cursor to `end` together with the positions at both ends from one snapshot of the
   * local log, and checks that the log still starts where the cursor says: the blocks signed so far were built on
   * that prefix, so a changed prefix (a content-changing L1 reorg) means the checkpoint cannot continue. A range the
   * log can no longer serve whole is the same condition.
   */
  private async readStreamingRange(state: StreamingCheckpointState, end: bigint): Promise<StreamingBundleSelection> {
    const { cursor } = state;
    let range: InboxMessageRange;
    try {
      range = await this.l1ToL2MessageSource.getL1ToL2MessageRange(cursor.totalMessageCount, end);
    } catch (err) {
      return {
        kind: 'abort',
        reason: 'inbox_range_unavailable',
        context: { end, error: err instanceof Error ? err.message : String(err) },
      };
    }
    if (!range.start.rollingHash.equals(cursor.rollingHash)) {
      return {
        kind: 'abort',
        reason: 'inbox_prefix_reorged',
        context: { end, localPrefixHash: range.start.rollingHash.toString() },
      };
    }
    return { kind: 'consume', range };
  }

  /** Runs the single Inbox endpoint query of an endpoint block within the block's build deadline. */
  private resolveEndpointWithinDeadline(cursor: InboxMessagePosition, upperBound: bigint, buildDeadline: number) {
    const remainingMs = buildDeadline * 1000 - this.dateProvider.now();
    const timeoutMs = Math.max(1, Math.min(INBOX_ENDPOINT_READ_TIMEOUT_MS, remainingMs));
    return executeTimeout(
      () =>
        resolveEndpoint({
          inbox: this.inbox,
          messageSource: this.l1ToL2MessageSource,
          cursor,
          upperBound,
        }),
      timeoutMs,
      `Inbox endpoint lookup at or before message total ${upperBound}`,
    ).catch((err): ReturnType<typeof resolveEndpoint> => {
      this.log.warn(`Inbox endpoint lookup failed, treating the endpoint as unresolved: ${err}`, {
        slot: this.targetSlot,
        checkpointNumber: this.checkpointNumber,
        upperBound,
      });
      return Promise.resolve({ ok: false, reason: 'no_live_endpoint', upperBound });
    });
  }

  /**
   * Reports that the streaming Inbox selection cannot complete this checkpoint and the slot is abandoned: the
   * checkpoint event, an operator warning and the failure metric. The blocks already signed are content-valid; only
   * the checkpoint that would end on them is unpublishable.
   */
  private reportStreamingAbort(
    state: StreamingCheckpointState,
    reason: string,
    extraContext: Record<string, unknown> = {},
  ): void {
    const context = {
      slot: this.targetSlot,
      checkpointNumber: this.checkpointNumber,
      checkpointStartTotalMsgCount: state.checkpointStartTotalMsgCount,
      consumedTotalMsgCount: state.cursor.totalMessageCount,
      inboxRollingHash: state.cursor.rollingHash.toString(),
      reason,
      ...extraContext,
    };
    this.logCheckpointEvent('build-failed', `Checkpoint build failed for slot ${this.targetSlot}`, context);
    this.log.warn(
      `Streaming Inbox consumption cannot complete this checkpoint; abandoning slot ${this.targetSlot}`,
      context,
    );
    this.metrics.recordCheckpointProposalFailed(reason);
  }

  /**
   * Sleeps until it is time to produce the next block in the slot.
   * @param nextSubslotStart - Absolute wall-clock timestamp in seconds of the previous sub-slot deadline.
   */
  @trackSpan('CheckpointProposalJob.waitUntilNextSubslot')
  protected async waitUntilNextSubslot(nextSubslotStart: number) {
    this.setState(SequencerState.WAITING_UNTIL_NEXT_BLOCK);
    this.log.verbose(`Waiting until time for the next block at ${nextSubslotStart}s`, {
      slot: this.targetSlot,
    });
    await this.awaitInterruptibleSleep(Math.max(0, nextSubslotStart * 1000 - this.dateProvider.now()));
  }

  /** Builds a single block. Called from the main block building loop. */
  @trackSpan('CheckpointProposalJob.buildSingleBlock')
  protected async buildSingleBlock(
    checkpointBuilder: CheckpointBuilder,
    opts: {
      forceCreate?: boolean;
      /** Build over the messages alone, without offering the builder any transaction to execute. */
      skipTransactions?: boolean;
      blockTimestamp: bigint;
      blockNumber: BlockNumber;
      indexWithinCheckpoint: IndexWithinCheckpoint;
      buildDeadline: Date | undefined;
      txHashesAlreadyIncluded: Set<string>;
      /** Streaming Inbox message bundle for this block's L1-to-L2 tree; undefined when it consumes nothing. */
      l1ToL2Messages?: Fr[];
    },
  ): Promise<
    { block: L2Block; usedTxs: Tx[] } | { failure: 'insufficient-txs' | 'insufficient-valid-txs' } | { error: Error }
  > {
    const {
      blockTimestamp,
      forceCreate,
      skipTransactions,
      blockNumber,
      indexWithinCheckpoint,
      buildDeadline,
      txHashesAlreadyIncluded,
      l1ToL2Messages,
    } = opts;

    this.log.verbose(
      `Preparing block ${blockNumber} index ${indexWithinCheckpoint} at checkpoint ${this.checkpointNumber} for slot ${this.targetSlot}`,
      { ...checkpointBuilder.getConstantData(), ...opts },
    );

    try {
      // Wait until we have enough txs to build the block
      const { canStartBuilding, minTxs } = await this.waitForMinTxs(opts);
      if (!canStartBuilding) {
        this.logCheckpointEvent('block-build-failed', `Block build failed for slot ${this.targetSlot}`, {
          reason: 'insufficient_txs',
          blockNumber,
          slot: this.targetSlot,
          checkpointNumber: this.checkpointNumber,
          indexWithinCheckpoint,
          minTxs,
        });
        this.log.verbose(
          `Not enough age-eligible txs to build block ${blockNumber} at index ${indexWithinCheckpoint} in slot ${this.targetSlot} (needs ${minTxs} eligible)`,
          {
            reason: 'insufficient_txs',
            blockNumber,
            slot: this.targetSlot,
            checkpointNumber: this.checkpointNumber,
            indexWithinCheckpoint,
            minTxs,
          },
        );
        this.eventEmitter.emit('block-tx-count-check-failed', { minTxs, slot: this.targetSlot });
        this.metrics.recordBlockProposalFailed('insufficient_txs');
        return { failure: 'insufficient-txs' };
      }

      // Create iterator to pending txs. We filter out txs already included in previous blocks in the checkpoint
      // just in case p2p failed to sync the provisional block and didn't get to remove those txs from the mempool yet.
      // Block building only executes txs, so we skip loading their proofs unless these same tx objects get attached
      // to the broadcasted proposals via publishTxsWithProposals.
      const pendingTxs = skipTransactions
        ? noTransactions()
        : filter(
            this.p2pClient.iterateEligiblePendingTxs({ includeProof: !!this.config.publishTxsWithProposals }),
            tx => !txHashesAlreadyIncluded.has(tx.txHash.toString()),
          );

      this.log.debug(`Building block ${blockNumber} at index ${indexWithinCheckpoint} for slot ${this.targetSlot}`, {
        slot: this.targetSlot,
        blockNumber,
        indexWithinCheckpoint,
      });
      this.setState(SequencerState.CREATING_BLOCK);

      // Per-block limits are operator overrides (from SEQ_MAX_L2_BLOCK_GAS etc.) further capped
      // by remaining checkpoint-level budgets inside CheckpointBuilder before each block is built.
      // minValidTxs is passed into the builder so it can reject the block *before* updating state.
      // A zero-tx block is proven by the no-txs block-root circuit at any index, but one carrying neither txs
      // nor messages past the first block is pure padding, so the floor for minValidTxs is 1 there.
      const configuredMinValidTxs = forceCreate ? 0 : (this.config.minValidTxsPerBlock ?? minTxs);
      const minValidTxs =
        indexWithinCheckpoint > 0 && (l1ToL2Messages?.length ?? 0) === 0
          ? Math.max(configuredMinValidTxs, 1)
          : configuredMinValidTxs;
      const blockBuilderOptions: BlockBuilderOptions = {
        maxTransactions: this.config.maxTxsPerBlock,
        maxBlockGas:
          this.config.maxL2BlockGas !== undefined || this.config.maxDABlockGas !== undefined
            ? new Gas(this.config.maxDABlockGas ?? Infinity, this.config.maxL2BlockGas ?? Infinity)
            : undefined,
        deadline: buildDeadline,
        isBuildingProposal: true,
        minValidTxs,
        maxBlocksPerCheckpoint: this.timetable.getMaxBlocksPerCheckpoint(),
        perBlockAllocationMultiplier: this.config.perBlockAllocationMultiplier,
        perBlockDAAllocationMultiplier: this.config.perBlockDAAllocationMultiplier,
        l1ToL2Messages,
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
        buildSlot: this.getBuildSlot(),
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
    /** Streaming Inbox message bundle this block consumes; a non-empty bundle permits a zero-tx (message-only) block. */
    l1ToL2Messages?: Fr[];
  }): Promise<{ canStartBuilding: boolean; minTxs: number }> {
    const { indexWithinCheckpoint, blockNumber, buildDeadline, forceCreate } = opts;

    // A non-empty streaming Inbox bundle is work on its own: the block must be produced even with zero txs,
    // regardless of minTxsPerBlock, so the messages get inserted (message-only block).
    // Without a bundle, a non-first block needs at least one tx to avoid empty filler blocks even when
    // minTxsPerBlock is zero.
    const hasStreamingBundle = (opts.l1ToL2Messages?.length ?? 0) > 0;
    const minTxs = hasStreamingBundle
      ? 0
      : indexWithinCheckpoint > 0 && this.config.minTxsPerBlock === 0
        ? 1
        : this.config.minTxsPerBlock;

    // Latest time to keep waiting for txs: wait_for_txs_deadline = block_build_deadline(k) - min_block_duration.
    const startBuildingDeadline = buildDeadline
      ? new Date(buildDeadline.getTime() - this.timetable.minBlockDuration * 1000)
      : undefined;

    // Gate on age-eligible txs so we don't start building on txs the builder would then filter out for being
    // too fresh. hasEligiblePendingTxs early-exits once minTxs are eligible instead of counting the whole pool.
    while (!forceCreate && !(await this.p2pClient.hasEligiblePendingTxs(minTxs))) {
      // If we're past deadline, or we have no deadline, give up
      const now = this.dateProvider.nowAsDate();
      if (startBuildingDeadline === undefined || now >= startBuildingDeadline) {
        return { canStartBuilding: false, minTxs };
      }

      // Never start a poll the send budget cannot cover. Peers refuse this slot's proposal once the send deadline
      // passes, so a full interval that ends past it cannot produce a block anyone would accept, and spending it
      // leaves nothing for the signing and archiver insertion still to come. Stop waiting and let the checkpoint
      // go with the blocks already built.
      const sendDeadline = this.getProposalSendDeadline();
      if (sendDeadline.getTime() - now.getTime() < TXS_POLLING_MS) {
        this.log.verbose(
          `Not waiting for txs to build block ${blockNumber} at index ${indexWithinCheckpoint} in slot ` +
            `${this.targetSlot}: a poll would outlast the proposal send deadline`,
          {
            blockNumber,
            slot: this.targetSlot,
            indexWithinCheckpoint,
            minTxs,
            sendDeadline: sendDeadline.toISOString(),
          },
        );
        return { canStartBuilding: false, minTxs };
      }

      // Wait a bit before checking again
      this.setState(SequencerState.WAITING_FOR_TXS);
      this.log.verbose(
        `Waiting for ${minTxs} age-eligible txs to build block ${blockNumber} at index ${indexWithinCheckpoint} in slot ${this.targetSlot}`,
        { blockNumber, slot: this.targetSlot, indexWithinCheckpoint, minTxs },
      );
      await this.waitForTxsPollingInterval();
    }

    return { canStartBuilding: true, minTxs };
  }

  private async getSignedCommitteeAttestations(
    broadcast: CheckpointProposalBroadcast,
  ): Promise<{ attestations: CommitteeAttestationsAndSigners; attestationsSignature: Signature } | undefined> {
    const { proposal, blockProposedAt } = broadcast;
    this.setState(SequencerState.COLLECTING_ATTESTATIONS);
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

    // Hard attestation-collection cutoff = the single consensus attestation_deadline (target_slot_start + S - 2E).
    const attestationDeadlineSeconds = this.timetable.getAttestationDeadline(this.targetSlot);
    const attestationDeadline = new Date(attestationDeadlineSeconds * 1000);

    this.metrics.recordRequiredAttestations(
      numberOfRequiredAttestations,
      Math.max(0, attestationDeadline.getTime() - this.dateProvider.now()),
    );

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
        this.config.injectYParityAttestation ||
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

    if (this.config.injectYParityAttestation) {
      // Force every non-proposer signed slot's recovery byte to yParity (v ∈ {0, 1}) form in the packed L1
      // tuple, after packAttestations has canonicalized it. The proposer's own slot is left canonical so
      // propose() still passes verifyProposer. Models a malicious proposer landing a checkpoint L1 accepts
      // but that can never be proven (ECDSA.recover rejects v ∉ {27, 28}).
      this.log.warn(`Injecting yParity attestations in checkpoint for slot ${slotNumber} (proposer #${proposerIndex})`);
      return new MaliciousYParityCommitteeAttestationsAndSigners(
        attestations,
        proposerIndex,
        this.getSignatureContext(),
      );
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
    const failures = failedTxs.map(fail => ({ txHash: fail.tx.getTxHash().toString(), reason: fail.error.message }));
    this.log.warn(
      `Dropping ${failedTxs.length} txs from mempool due to failures during block building for slot ${this.targetSlot}`,
      { slot: this.targetSlot, checkpointNumber: this.checkpointNumber, failures },
    );
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
  private async syncProposedBlockToArchiver(block: L2Block, inboxPrefixRef: InboxMessagePrefixRef): Promise<void> {
    if (this.config.skipPushProposedBlocksToArchiver || this.config.fishermanMode) {
      this.log.warn(`Skipping push of proposed block ${block.number} to archiver`, {
        blockNumber: block.number,
        slot: block.header.globalVariables.slotNumber,
      });
      return;
    }
    // The archiver re-validates this reference against its own messages inside the insert transaction, which is what
    // stops a block built before an L1 reorg from landing after the reorg pruned the chain it belongs to.
    this.log.debug(`Syncing proposed block ${block.number} to archiver`, {
      blockNumber: block.number,
      slot: block.header.globalVariables.slotNumber,
    });
    await this.blockSink.addBlock(block, inboxPrefixRef);
  }

  /**
   * Adds the proposed checkpoint to the archiver so the proposer's optimistic proposed-checkpoint
   * tip advances locally. Gossip doesn't echo our own messages back, so without this the proposer
   * would never see its own proposed checkpoint and couldn't pipeline the next slot.
   *
   * Skipped whenever proposed blocks aren't pushed (`skipPushProposedBlocksToArchiver`, fisherman
   * mode): the archiver derives the checkpoint archive from its stored blocks, so without them the
   * push would fail. All blocks were already added (and awaited) during block building, so this
   * needs no retry — they are guaranteed present by the time we get here.
   */
  private async syncProposedCheckpointToArchiver(
    checkpoint: Checkpoint,
    blockCount: number,
    feeAssetPriceModifier: bigint,
  ): Promise<void> {
    if (this.config.skipPushProposedBlocksToArchiver || this.config.fishermanMode) {
      return;
    }
    const startBlock = BlockNumber(this.syncedToBlockNumber + 1);
    this.log.debug(`Syncing proposed checkpoint ${this.checkpointNumber} to archiver`, {
      checkpointNumber: this.checkpointNumber,
      slot: this.targetSlot,
      startBlock,
      blockCount,
    });
    await this.blockSink.addProposedCheckpoint({
      header: checkpoint.header,
      checkpointNumber: this.checkpointNumber,
      startBlock,
      blockCount,
      totalManaUsed: checkpoint.header.totalManaUsed.toBigInt(),
      feeAssetPriceModifier,
    });
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

  /** Waits the polling interval for transactions. Extracted for test overriding. */
  protected async waitForTxsPollingInterval(): Promise<void> {
    await this.awaitInterruptibleSleep(TXS_POLLING_MS);
  }

  public getPublisher() {
    return this.publisher;
  }
}
