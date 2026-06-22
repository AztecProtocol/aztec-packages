import type { BatchedBlob } from '@aztec/blob-lib';
import type { ViemCommitteeAttestation } from '@aztec/ethereum/contracts';
import { BlockNumber, type CheckpointNumber, type EpochNumber } from '@aztec/foundation/branded-types';
import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { SerialQueue } from '@aztec/foundation/queue';
import type { DateProvider } from '@aztec/foundation/timer';
import type { L2BlockSource } from '@aztec/stdlib/block';
import type { Proof } from '@aztec/stdlib/proofs';
import type { CheckpointHeader, RootRollupPublicInputs } from '@aztec/stdlib/rollup';

import type { ProverNodePublisher } from './prover-node-publisher.js';
import type { ProverPublisherFactory } from './prover-publisher-factory.js';

/** A single proof candidate offered to the publishing service by an `EpochSession`. */
export type PublishCandidate = {
  /** Stable id; matches the originating session so `withdraw` can target this entry. */
  id: string;
  epoch: EpochNumber;
  /**
   * Full vs partial. A `partial` candidate is an early-finish optimisation: if the chain's
   * proven tip catches up to or past its `endBlock` before it publishes, it's superseded —
   * publishing would be wasted L1 gas. A `full` candidate covers the entire epoch and is
   * useful to publish even after some other prover-node has already submitted (the rollup
   * contract records the submission per prover-id), so it is never auto-superseded by the
   * proven tip alone.
   */
  kind: 'full' | 'partial';
  /** First L2 block in the candidate's range. */
  startBlock: BlockNumber;
  /** Last L2 block in the candidate's range. */
  endBlock: BlockNumber;
  /**
   * Wall-clock time after which the candidate is no longer worth publishing — typically
   * the L1 proof-submission window deadline. If the candidate is still queued at this
   * time it resolves as `'expired'`. If it's already in flight, the publish runs to
   * completion (the L1 tx may still mine; the deadline only governs whether the service
   * will start a publish). `undefined` disables the per-candidate timer.
   */
  deadline: Date | undefined;
  /** Everything `ProverNodePublisher.submitEpochProof` needs. */
  fromCheckpoint: CheckpointNumber;
  toCheckpoint: CheckpointNumber;
  publicInputs: RootRollupPublicInputs;
  proof: Proof;
  batchedBlobInputs: BatchedBlob;
  attestations: ViemCommitteeAttestation[];
  /** Committee-attested checkpoint headers for the range, supplying the L1-verified fee recipient/value. */
  headers: CheckpointHeader[];
};

/** Terminal outcome for a candidate. The promise from `submit()` resolves with one of these. */
export type PublishOutcome = 'published' | 'superseded' | 'failed' | 'withdrawn' | 'expired';

/** Subset of `ProverPublisherFactory` the service uses — single async `create()` call. */
export type PublisherFactoryLike = Pick<ProverPublisherFactory, 'create'>;

/** Subset of `ProverNodePublisher` the service drives — one publish per fresh publisher. */
export type PublisherLike = Pick<ProverNodePublisher, 'submitEpochProof' | 'analyzeEpochProofSubmission'>;

/** Config for the publishing service. */
export type ProofPublishingServiceConfig = {
  /** When true, submitting a candidate runs `analyzeEpochProofSubmission` instead of publishing. */
  skipSubmitProof: boolean;
};

export type ProofPublishingServiceDeps = {
  publisherFactory: PublisherFactoryLike;
  l2BlockSource: Pick<L2BlockSource, 'getBlockNumber'>;
  dateProvider: DateProvider;
  config: ProofPublishingServiceConfig;
  bindings?: LoggerBindings;
};

/** Per-epoch bucket: live candidates, their pending-outcome resolvers, and expiry timers. */
type EpochBucket = {
  candidates: Map<string, PublishCandidate>;
  resolvers: Map<string, (outcome: PublishOutcome) => void>;
  expiryTimers: Map<string, NodeJS.Timeout>;
};

/**
 * Backoff after a transient `publisherFactory.create()` failure. The candidate stays
 * in the queue and the drain is re-scheduled after this delay; if the failure persists
 * the candidate's own `deadline` timer caps the total wait.
 */
const PUBLISHER_ACQUIRE_RETRY_DELAY_MS = 1_000;

/**
 * Central owner of L1 proof submission. Sessions offer their proofs here as
 * `PublishCandidate`s; the service serialises one publish at a time, picks the
 * longest candidate per epoch as the winner, and resolves the rest as
 * `'superseded'` without spending L1 gas.
 *
 * Construction-time invariants:
 * - Every publish runs against a freshly-created `ProverNodePublisher` from the factory.
 * - Only one publish is ever in flight (`SerialQueue` drain) — no defensive locks.
 * - Once an L1 publish starts, it runs to completion. `withdraw` is a queue-only
 *   operation: it removes a candidate that has not yet started publishing. An in-flight
 *   candidate is left alone and its outcome (`'published'` / `'failed'`) is reported as
 *   usual — the originating session has already moved to a terminal state via `cancel()`
 *   and ignores the late outcome.
 *
 * Eligibility for publication is decided against the proven block number read inside
 * the drain (so the value is consistent with the publish that runs on the same drain
 * pass): a candidate is eligible when its predecessor block is proven and (for partial
 * candidates) the candidate's range extends past the proven tip. `onChainProven` is a
 * wake-up signal; it does not pass state into the drain.
 */
export class ProofPublishingService {
  private readonly log: Logger;
  private readonly epochs: Map<EpochNumber, EpochBucket> = new Map();
  /**
   * One drain task at a time. Submits, withdrawals, chain-proven advances, and prunes
   * all schedule a `drain` here, so the eligibility re-check and the L1 publish never
   * interleave.
   *
   * Protected so unit tests can `await drainQueue.syncPoint()` to wait for pending
   * drain work to settle deterministically (no sleeps).
   */
  protected readonly drainQueue = new SerialQueue();
  /** Tracks the candidate currently being published. Set while drain is awaiting the L1 publish. */
  private inFlight: { id: string } | undefined;
  private stopped = false;

  constructor(private readonly deps: ProofPublishingServiceDeps) {
    this.log = createLogger('prover-node:proof-publishing-service', deps.bindings);
    this.drainQueue.start();
  }

  /**
   * Offers a proof candidate to the service. The returned promise resolves once the
   * service settles the candidate's fate: `'published'` if it wins and L1 accepts it,
   * `'superseded'` if a longer candidate for the same epoch wins, `'failed'` if the
   * L1 submission errored, `'withdrawn'` if the originating session cancelled,
   * `'expired'` if the candidate's `deadline` elapsed before publishing started.
   */
  public submit(candidate: PublishCandidate): Promise<PublishOutcome> {
    if (this.stopped) {
      return Promise.resolve<PublishOutcome>('withdrawn');
    }
    const { promise, resolve } = promiseWithResolvers<PublishOutcome>();
    let bucket = this.epochs.get(candidate.epoch);
    if (!bucket) {
      bucket = { candidates: new Map(), resolvers: new Map(), expiryTimers: new Map() };
      this.epochs.set(candidate.epoch, bucket);
    }
    bucket.candidates.set(candidate.id, candidate);
    bucket.resolvers.set(candidate.id, resolve);
    this.scheduleExpiry(bucket, candidate);
    this.log.info(`Candidate proof ${candidate.id} submitted for publishing`, {
      candidateId: candidate.id,
      epoch: candidate.epoch,
      startBlock: candidate.startBlock,
      endBlock: candidate.endBlock,
      deadline: candidate.deadline?.toISOString(),
    });
    this.scheduleDrain();
    return promise;
  }

  /**
   * Pulls a queued candidate from the bucket and resolves its promise as `'withdrawn'`.
   * If the candidate is already being published, the publish runs to completion and the
   * outcome reports whatever L1 returned — callers that cancelled mid-publish must rely
   * on their own terminal-state check to ignore the late outcome. No-op if the candidate
   * is unknown.
   */
  public withdraw(candidateId: string): void {
    if (this.inFlight?.id === candidateId) {
      this.log.debug(`Withdraw for in-flight candidate ${candidateId} ignored; publish will run to completion`, {
        candidateId,
      });
      return;
    }
    for (const bucket of this.epochs.values()) {
      if (bucket.candidates.has(candidateId)) {
        this.log.info(`Candidate ${candidateId} withdrawn`, { candidateId });
        this.resolveCandidate(bucket, candidateId, 'withdrawn');
        this.scheduleDrain();
        return;
      }
    }
  }

  /**
   * Signals that the L1 proven tip has advanced and the queue should be re-evaluated.
   * The drain reads the proven block number from `l2BlockSource` itself rather than
   * relying on the value passed here — that way the eligibility check uses a value read
   * inside the serial drain, not one captured by a concurrent caller of `onChainProven`.
   */
  public onChainProven(_provenBlock: BlockNumber): void {
    this.scheduleDrain();
  }

  /**
   * Stops accepting new submissions, waits for any in-flight publish to settle, and
   * resolves remaining queued candidates as `'withdrawn'`.
   */
  public async stop(): Promise<void> {
    this.stopped = true;
    await this.drainQueue.end();
    // Anything still parked in a bucket never ran through drain — resolve it as withdrawn so
    // callers awaiting `submit()` aren't left hanging.
    for (const bucket of Array.from(this.epochs.values())) {
      for (const id of Array.from(bucket.candidates.keys())) {
        this.resolveCandidate(bucket, id, 'withdrawn');
      }
    }
    this.epochs.clear();
  }

  // ---------------- drain ----------------

  private scheduleDrain(): void {
    if (this.stopped) {
      return;
    }
    void this.drainQueue
      .put(() => this.drain())
      .catch(err => {
        this.log.error(`Drain task threw`, err);
      });
  }

  private async drain(): Promise<void> {
    if (this.stopped) {
      return;
    }
    // Read the proven block number afresh inside the serial drain so the eligibility
    // check is consistent with the publish that follows it on the same drain pass.
    const proven = await this.readProvenBlockNumber();

    // Process epochs in ascending order: the proven tip advances monotonically, so the lower
    // epoch is the natural next eligible candidate.
    const orderedEpochs = Array.from(this.epochs.keys()).sort((a, b) => Number(a) - Number(b));
    for (const epoch of orderedEpochs) {
      const bucket = this.epochs.get(epoch)!;
      const eligible = this.pickEpochWinner(bucket, proven);
      if (!eligible) {
        continue;
      }
      await this.publishWinner(epoch, eligible.winner, bucket);
    }

    // Drop empty buckets
    for (const [key, bucket] of Array.from(this.epochs.entries())) {
      if (bucket.candidates.size === 0) {
        this.epochs.delete(key);
      }
    }
  }

  /**
   * Picks the winning candidate for a given epoch. Partial candidates whose `endBlock` is
   * already proven on-chain resolve `'superseded'`.
   * Full candidates are never auto-superseded by the proven tip — multiple prover-nodes
   * legitimately submit redundant full epoch proofs (one per prover-id) and L1 records each.
   * Among the remaining candidates with their predecessor proven, the one with the highest
   * `endBlock` wins; the others resolve `'superseded'`.
   */
  private pickEpochWinner(bucket: EpochBucket, proven: BlockNumber): { winner: PublishCandidate } | undefined {
    const now = this.deps.dateProvider.now();
    // Resolve any candidate whose deadline has already passed.
    for (const candidate of Array.from(bucket.candidates.values())) {
      if (candidate.deadline && candidate.deadline.getTime() <= now) {
        this.resolveCandidate(bucket, candidate.id, 'expired');
      }
    }
    // Drop partial candidates the proven chain has already caught up to.
    for (const candidate of Array.from(bucket.candidates.values())) {
      if (candidate.kind === 'partial' && candidate.endBlock <= proven) {
        this.resolveCandidate(bucket, candidate.id, 'superseded');
      }
    }

    const remaining = Array.from(bucket.candidates.values()).filter(c => c.startBlock - 1 <= proven);
    if (remaining.length === 0) {
      return undefined;
    }
    const winner = remaining.reduce((best, c) => (c.endBlock > best.endBlock ? c : best));
    // Every other same-epoch candidate is superseded by the winner.
    for (const candidate of remaining) {
      if (candidate.id !== winner.id) {
        this.resolveCandidate(bucket, candidate.id, 'superseded');
      }
    }
    return { winner };
  }

  private async publishWinner(epoch: EpochNumber, winner: PublishCandidate, bucket: EpochBucket): Promise<void> {
    let publisher: PublisherLike;
    try {
      publisher = await this.deps.publisherFactory.create();
    } catch (err) {
      // Treat this as transient: the publisher pool may be temporarily exhausted
      // (every signer busy, funding tx in flight, etc.). Leave the candidate queued and
      // schedule another drain after a short backoff. If the failure persists past the
      // candidate's deadline the expiry timer will resolve it as `'expired'`.
      this.log.warn(`Failed to acquire publisher for candidate ${winner.id}; retrying`, {
        candidateId: winner.id,
        epoch: winner.epoch,
        retryDelayMs: PUBLISHER_ACQUIRE_RETRY_DELAY_MS,
        err,
      });
      setTimeout(() => this.scheduleDrain(), PUBLISHER_ACQUIRE_RETRY_DELAY_MS);
      return;
    }

    this.inFlight = { id: winner.id };
    this.log.info(`Publishing candidate ${winner.id}`, {
      candidateId: winner.id,
      epoch: winner.epoch,
      startBlock: winner.startBlock,
      endBlock: winner.endBlock,
      fromCheckpoint: winner.fromCheckpoint,
      toCheckpoint: winner.toCheckpoint,
    });

    const outcome = await this.runPublish(winner, publisher);
    this.inFlight = undefined;
    this.resolveCandidate(bucket, winner.id, outcome);

    if (bucket.candidates.size === 0) {
      this.epochs.delete(epoch);
    }
  }

  private async runPublish(candidate: PublishCandidate, publisher: PublisherLike): Promise<PublishOutcome> {
    const submitArgs = {
      epochNumber: candidate.epoch,
      fromCheckpoint: candidate.fromCheckpoint,
      toCheckpoint: candidate.toCheckpoint,
      publicInputs: candidate.publicInputs,
      proof: candidate.proof,
      batchedBlobInputs: candidate.batchedBlobInputs,
      attestations: candidate.attestations,
      headers: candidate.headers,
      // Stop the L1 tx retrying past the candidate's submission-window deadline.
      deadline: candidate.deadline,
    };

    if (this.deps.config.skipSubmitProof) {
      try {
        await publisher.analyzeEpochProofSubmission(submitArgs);
        return 'published';
      } catch (err) {
        this.log.warn(`Failed to analyze estimated L1 fees for candidate ${candidate.id}`, {
          err,
          candidateId: candidate.id,
          epoch: candidate.epoch,
        });
        // Analyze-mode failures are recorded but the session shouldn't enter `failed` —
        // the operator opted out of submission. Match the previous EpochSession behaviour.
        return 'published';
      }
    }

    try {
      const success = await publisher.submitEpochProof(submitArgs);
      return success ? 'published' : 'failed';
    } catch (err) {
      this.log.error(`Error publishing candidate ${candidate.id}`, err, {
        candidateId: candidate.id,
        epoch: candidate.epoch,
      });
      return 'failed';
    }
  }

  private resolveCandidate(bucket: EpochBucket, id: string, outcome: PublishOutcome): void {
    const resolve = bucket.resolvers.get(id);
    const timer = bucket.expiryTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      bucket.expiryTimers.delete(id);
    }
    bucket.candidates.delete(id);
    bucket.resolvers.delete(id);
    if (resolve) {
      this.log.info(`Candidate ${id} resolved as ${outcome}`, { candidateId: id, outcome });
      resolve(outcome);
    }
  }

  /**
   * Arms a per-candidate expiry timer if the candidate carries a deadline. When the timer
   * fires, the candidate resolves as `'expired'` — unless it is already in flight, in
   * which case the publish runs to completion (the timer becomes a no-op). The timer is
   * cleared by `resolveCandidate` whenever the candidate settles for any other reason.
   */
  private scheduleExpiry(bucket: EpochBucket, candidate: PublishCandidate): void {
    if (!candidate.deadline) {
      return;
    }
    const delay = Math.max(candidate.deadline.getTime() - this.deps.dateProvider.now(), 0);
    const timer = setTimeout(() => this.handleExpiry(candidate.id), delay);
    bucket.expiryTimers.set(candidate.id, timer);
  }

  /**
   * Protected so unit tests can drive the deadline path without waiting on the real
   * `setTimeout` to fire. Production code calls this only via the per-candidate timer
   * armed in `scheduleExpiry`.
   */
  protected handleExpiry(candidateId: string): void {
    if (this.inFlight?.id === candidateId) {
      this.log.debug(`Expiry for in-flight candidate ${candidateId} ignored; publish will run to completion`, {
        candidateId,
      });
      return;
    }
    for (const bucket of this.epochs.values()) {
      if (bucket.candidates.has(candidateId)) {
        this.log.info(`Candidate ${candidateId} expired before publishing`, { candidateId });
        this.resolveCandidate(bucket, candidateId, 'expired');
        this.scheduleDrain();
        return;
      }
    }
  }

  private async readProvenBlockNumber(): Promise<BlockNumber> {
    const proven = await this.deps.l2BlockSource.getBlockNumber({ tag: 'proven' });
    return BlockNumber(proven ?? 0);
  }
}
