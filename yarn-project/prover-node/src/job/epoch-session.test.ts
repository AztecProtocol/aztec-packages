import { BatchedBlob } from '@aztec/blob-lib/types';
import { ARCHIVE_HEIGHT } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { DateProvider } from '@aztec/foundation/timer';
import type { EpochProverFactory } from '@aztec/prover-client';
import type { TopTreeOrchestrator } from '@aztec/prover-client/orchestrator';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';
import { BlockHeader } from '@aztec/stdlib/tx';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { mock } from 'jest-mock-extended';

import { ProverNodeJobMetrics } from '../metrics.js';
import type { ProofPublishingService, PublishCandidate, PublishOutcome } from '../proof-publishing-service.js';
import { CheckpointProver } from './checkpoint-prover.js';
import {
  type EpochProvingJobState,
  EpochSession,
  type EpochSessionDeps,
  type EpochSessionHooks,
  type SessionSpec,
} from './epoch-session.js';
import type { TopTreeProof } from './top-tree-job.js';

describe('EpochSession', () => {
  let proverFactory: ReturnType<typeof mock<EpochProverFactory>>;
  let publishingService: ReturnType<typeof mock<Pick<ProofPublishingService, 'submit' | 'withdraw'>>>;
  let topTree: ReturnType<typeof mock<TopTreeOrchestrator>>;
  let metrics: ProverNodeJobMetrics;
  let dateProvider: DateProvider;
  let cp: Checkpoint;
  let stubProver: CheckpointProver;
  let synthProof: TopTreeProof;
  /** Resolves on the next createTopTreeOrchestrator call — used to await TopTreeJob construction. */
  let topTreeConstructed: ReturnType<typeof promiseWithResolvers<void>>;

  beforeEach(async () => {
    cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 2 });
    stubProver = makeStubProver(cp);

    topTree = mock<TopTreeOrchestrator>();
    proverFactory = mock<EpochProverFactory>();
    topTreeConstructed = promiseWithResolvers<void>();
    // Signal as soon as the TopTreeJob constructor reaches createTopTreeOrchestrator — by
    // the time the awaiter resumes, EpochSession.run has already assigned `this.topTreeJob`
    // (the assignment is the next sync statement after `new TopTreeJob(...)`).
    proverFactory.createTopTreeOrchestrator.mockImplementation(() => {
      topTreeConstructed.resolve();
      return topTree;
    });
    publishingService = mock<Pick<ProofPublishingService, 'submit' | 'withdraw'>>();

    const telemetry = getTelemetryClient();
    metrics = new ProverNodeJobMetrics(telemetry.getMeter('test'), telemetry.getTracer('test'));
    dateProvider = new DateProvider();

    synthProof = {
      publicInputs: RootRollupPublicInputs.random(),
      proof: Proof.empty(),
      batchedBlobInputs: makeBlob(),
    };
  });

  // ---------------- construction ----------------

  describe('construction', () => {
    it('throws on an empty prover set', () => {
      expect(() => new EpochSession(makeSpec(), [], makeDeps())).toThrow(/empty checkpoint set/);
    });

    it('initial state is "initialized" and not terminal', () => {
      const session = makeSession();
      expect(session.getState()).toBe('initialized');
      expect(session.isTerminal()).toBe(false);
    });

    it('accessors return the spec values', () => {
      const session = makeSession();
      expect(session.getEpochNumber()).toEqual(EpochNumber(5));
      expect(session.getKind()).toBe('full');
      expect(session.getId()).toMatch(/^[\da-f-]+$/i);
      expect(session.getSpec()).toEqual(makeSpec());
      expect(session.getCheckpoints()).toEqual([stubProver]);
    });

    it('getStartBlockNumber / getEndBlockNumber span the contained checkpoint blocks', () => {
      const session = makeSession();
      const blocks = cp.blocks;
      expect(session.getStartBlockNumber()).toEqual(BlockNumber(blocks[0].number));
      expect(session.getEndBlockNumber()).toEqual(BlockNumber(blocks[blocks.length - 1].number));
    });

    it('defensively copies the prover array so external mutation cannot corrupt it', () => {
      const provers: CheckpointProver[] = [stubProver];
      const session = new EpochSession(makeSpec(), provers, makeDeps());
      provers.length = 0;
      expect(session.getCheckpoints().length).toBe(1);
    });
  });

  // ---------------- happy path ----------------

  describe('start (happy path)', () => {
    it('runs to "completed" when the publishing service reports "published"', async () => {
      publishingService.submit.mockResolvedValue('published');
      const session = makeSession();
      const state = await session.start();
      expect(state).toBe('completed');
      expect(session.getState()).toBe('completed');
      expect(session.isTerminal()).toBe(true);
      await expect(session.whenDone()).resolves.toBe('completed');
    });

    it('submits a candidate whose id, kind, range, and checkpoint bounds come from the session', async () => {
      publishingService.submit.mockResolvedValue('published');
      const session = makeSession();
      await session.start();
      expect(publishingService.submit).toHaveBeenCalledTimes(1);
      const candidate = publishingService.submit.mock.calls[0]![0] as PublishCandidate;
      expect(candidate.id).toBe(session.getId());
      expect(candidate.kind).toBe('full');
      expect(candidate.epoch).toEqual(EpochNumber(5));
      expect(candidate.startBlock).toEqual(session.getStartBlockNumber());
      expect(candidate.endBlock).toEqual(session.getEndBlockNumber());
      expect(candidate.fromCheckpoint).toEqual(CheckpointNumber(1));
      expect(candidate.toCheckpoint).toEqual(CheckpointNumber(1));
    });
  });

  // ---------------- outcome mapping ----------------

  describe('publishing outcome → terminal state', () => {
    it.each<[PublishOutcome, string]>([
      ['published', 'completed'],
      ['superseded', 'superseded'],
      ['expired', 'timed-out'],
    ])('maps "%s" → "%s"', async (outcome, expected) => {
      publishingService.submit.mockResolvedValue(outcome);
      const session = makeSession();
      const state = await session.start();
      expect(state).toBe(expected);
    });

    it('"failed" submit outcome propagates as a thrown error → state "stopped" (retryable)', async () => {
      // A failed L1 submission is not a declared epoch failure — it ends the attempt in the
      // non-declaring terminal 'stopped', leaving the reconciler free to retry within the window.
      publishingService.submit.mockResolvedValue('failed');
      const session = makeSession();
      const state = await session.start();
      expect(state).toBe('stopped');
    });

    it('"withdrawn" outcome with no prior cancel falls back to "cancelled"', async () => {
      publishingService.submit.mockResolvedValue('withdrawn');
      const session = makeSession();
      const state = await session.start();
      expect(state).toBe('cancelled');
    });
  });

  // ---------------- cancellation ----------------

  describe('cancel', () => {
    it('flips state to "cancelled" and calls publishingService.withdraw with the session id', async () => {
      const session = makeSession();
      await session.cancel();
      expect(session.getState()).toBe('cancelled');
      expect(session.isTerminal()).toBe(true);
      expect(publishingService.withdraw).toHaveBeenCalledWith(session.getId());
    });

    it('is idempotent — repeated calls do not re-withdraw or change state', async () => {
      const session = makeSession();
      await session.cancel();
      await session.cancel();
      await session.cancel();
      expect(session.getState()).toBe('cancelled');
      expect(publishingService.withdraw).toHaveBeenCalledTimes(1);
    });

    it('cancel during top-tree prove unwinds cleanly and end state stays "cancelled"', async () => {
      // Hold prove indefinitely; cancel must stop the session out from under it. The gate
      // is left pending past assertion: it has a single handler (TopTreeJob.run's await),
      // so it never surfaces as an unhandled rejection. Resolving/rejecting it after the
      // cancel risks leaking an unhandled rejection into the next test.
      const proveGate = promiseWithResolvers<TopTreeProof>();
      const session = makeSession({ hooks: { topTreeProveOverride: () => proveGate.promise } });
      const startResult = session.start();
      // Explicit trigger: wait until the TopTreeJob has been constructed (and thus assigned
      // to `this.topTreeJob`) before issuing the cancel.
      await topTreeConstructed.promise;
      await session.cancel();
      await expect(startResult).resolves.toBe('cancelled');
      // cancel() drops the top-tree job and cleanup awaits its teardown.
      expect(topTree.stop).toHaveBeenCalled();
    });

    it('aborts the in-flight broker jobs on a normal cancel (abortJobs defaults to true)', async () => {
      const proveGate = promiseWithResolvers<TopTreeProof>();
      const session = makeSession({ hooks: { topTreeProveOverride: () => proveGate.promise } });
      const startResult = session.start();
      await topTreeConstructed.promise;
      await session.cancel('canonical content changed');
      await expect(startResult).resolves.toBe('cancelled');
      expect(topTree.cancel).toHaveBeenCalledWith({ abortJobs: true });
    });

    it('preserves the in-flight broker jobs when cancelled with abortJobs=false (clean shutdown)', async () => {
      const proveGate = promiseWithResolvers<TopTreeProof>();
      const session = makeSession({ hooks: { topTreeProveOverride: () => proveGate.promise } });
      const startResult = session.start();
      await topTreeConstructed.promise;
      await session.cancel('prover-node stopping', { abortJobs: false });
      await expect(startResult).resolves.toBe('cancelled');
      expect(topTree.cancel).toHaveBeenCalledWith({ abortJobs: false });
    });

    it('cancel after start has settled leaves the existing terminal state in place', async () => {
      publishingService.submit.mockResolvedValue('published');
      const session = makeSession();
      await session.start();
      expect(session.getState()).toBe('completed');
      await session.cancel();
      expect(session.getState()).toBe('completed');
      // withdraw is NOT called once the session has already terminated.
      expect(publishingService.withdraw).not.toHaveBeenCalled();
    });

    it('a withdraw error from the publishing service does not stop cancel from finishing', async () => {
      publishingService.withdraw.mockImplementation(() => {
        throw new Error('publishing service crashed');
      });
      const session = makeSession();
      await expect(session.cancel()).resolves.toBeUndefined();
      expect(session.getState()).toBe('cancelled');
    });
  });

  // ---------------- deadline ----------------

  describe('deadline', () => {
    it('fires while prove is in flight → state transitions to "timed-out"', async () => {
      const proveGate = promiseWithResolvers<TopTreeProof>();
      // Deadline far in the future — the test drives handleDeadline manually via
      // triggerDeadline(), so the real setTimeout never fires within the test window.
      const deadline = new Date(dateProvider.now() + 60_000);
      const session = makeSession({
        deadline,
        hooks: { topTreeProveOverride: () => proveGate.promise },
      });
      const startResult = session.start();
      await topTreeConstructed.promise;
      // Drive the deadline path directly — handleDeadline returns a promise that resolves
      // only after the 'cancelled' → 'timed-out' state flip has landed.
      await session.triggerDeadline();
      expect(session.getState()).toBe('timed-out');
      expect(publishingService.withdraw).toHaveBeenCalledWith(session.getId());
      // start()'s return value may still be 'cancelled' due to the race between the
      // resolveCompletion call inside cancel and the state flip after it — the canonical
      // observable for the deadline outcome is getState() above.
      await startResult;
    });

    it('does not fire when the session completes before its deadline', async () => {
      publishingService.submit.mockResolvedValue('published');
      const deadline = new Date(dateProvider.now() + 60_000); // far enough out
      const session = makeSession({ deadline });
      const state = await session.start();
      expect(state).toBe('completed');
      // withdraw is never called on the happy path.
      expect(publishingService.withdraw).not.toHaveBeenCalled();
    });
  });

  // ---------------- checkpoint failure ----------------

  describe('checkpoint that fails to prove', () => {
    it('ends the session in "stopped" (not "failed") when a checkpoint\'s blockProofs reject', async () => {
      // Build a prover whose block-rollup proofs are guaranteed to reject — this mirrors
      // the production path where CheckpointProver.executeCheckpoint catches an internal
      // error (e.g. a data-plane reorg fork fault) and rejects its blockProofs promise.
      // The session must NOT declare the epoch failed: it ends in the non-declaring terminal
      // 'stopped', leaving the reconciler free to rebuild it over current canonical content.
      const failingProver = makeStubProver(cp, { blockProofsError: new Error('block 7 proving failed') });
      const session = new EpochSession(
        makeSpec(),
        [failingProver],
        makeDeps({
          // Override mirrors what the real topTree.prove(...) does: awaits each prover's
          // blockProofs and propagates the rejection up.
          hooks: { topTreeProveOverride: () => failingProver.whenBlockProofsReady().then(() => synthProof) },
        }),
      );
      const state = await session.start();
      expect(state).toBe('stopped');
      expect(session.isTerminal()).toBe(true);
      // Failure happens before submission; the publishing service must never see the candidate.
      expect(publishingService.submit).not.toHaveBeenCalled();
    });

    it('whenDone resolves to "stopped" so callers observing the lifecycle agree with the return value', async () => {
      const failingProver = makeStubProver(cp, { blockProofsError: new Error('boom') });
      const session = new EpochSession(
        makeSpec(),
        [failingProver],
        makeDeps({
          hooks: { topTreeProveOverride: () => failingProver.whenBlockProofsReady().then(() => synthProof) },
        }),
      );
      const startResult = session.start();
      await expect(session.whenDone()).resolves.toBe('stopped');
      await expect(startResult).resolves.toBe('stopped');
    });

    it('a prove that rejects for any reason ends the session in "stopped" without submitting', async () => {
      // Belt-and-braces: any prove rejection (top-tree internal error, blob computation,
      // etc.) follows the same path. The session swallows the error and reports 'stopped'.
      const session = makeSession({
        hooks: { topTreeProveOverride: () => Promise.reject(new Error('top-tree internal failure')) },
      });
      const state = await session.start();
      expect(state).toBe('stopped');
      expect(publishingService.submit).not.toHaveBeenCalled();
    });
  });

  // ---------------- hooks ----------------

  describe('hooks', () => {
    it('beforeTopTreeProve fires before the prove override and afterTopTreeProve after it', async () => {
      const calls: string[] = [];
      publishingService.submit.mockResolvedValue('published');
      const session = makeSession({
        hooks: {
          beforeTopTreeProve: () => {
            calls.push('before');
          },
          topTreeProveOverride: () => {
            calls.push('prove');
            return Promise.resolve(synthProof);
          },
          afterTopTreeProve: () => {
            calls.push('after');
          },
        },
      });
      await session.start();
      expect(calls).toEqual(['before', 'prove', 'after']);
    });
  });

  // ---------------- state reporting ----------------

  describe('state reporting', () => {
    it('advances through awaiting-root (while proving) and publishing-proof (while submitting)', async () => {
      let stateDuringProve: EpochProvingJobState | undefined;
      let stateDuringSubmit: EpochProvingJobState | undefined;
      const session = makeSession({
        hooks: {
          // beforeProve has already flipped the state by the time the prove runs.
          topTreeProveOverride: () => {
            stateDuringProve = session.getState();
            return Promise.resolve(synthProof);
          },
        },
      });
      publishingService.submit.mockImplementation(() => {
        stateDuringSubmit = session.getState();
        return Promise.resolve('published');
      });

      const state = await session.start();

      expect(stateDuringProve).toBe('awaiting-root');
      expect(stateDuringSubmit).toBe('publishing-proof');
      expect(state).toBe('completed');
    });
  });

  // ---------------- helpers ----------------

  /** Default session spec used by every test that doesn't override it. */
  function makeSpec(): SessionSpec {
    return {
      kind: 'full',
      epochNumber: EpochNumber(5),
      fromSlot: cp.header.slotNumber,
      toSlot: cp.header.slotNumber,
    };
  }

  /**
   * Default deps. Tests inject a `topTreeProveOverride` whenever they don't want the real
   * (and missing) orchestrator to be called — by default the hook returns `synthProof`
   * immediately so submit can be exercised.
   */
  function makeDeps(opts: { hooks?: EpochSessionHooks; deadline?: Date } = {}): EpochSessionDeps {
    const hooks: EpochSessionHooks = {
      topTreeProveOverride: () => Promise.resolve(synthProof),
      ...opts.hooks,
    };
    return {
      proverFactory,
      proverId: EthAddress.ZERO,
      publishingService,
      metrics,
      dateProvider,
      deadline: opts.deadline,
      config: {},
      hooks,
    };
  }

  function makeSession(opts: { hooks?: EpochSessionHooks; deadline?: Date } = {}): TestEpochSession {
    return new TestEpochSession(makeSpec(), [stubProver], makeDeps(opts));
  }
});

/**
 * Subclass that exposes the protected `handleDeadline` so tests can drive the deadline
 * path directly without waiting on the real `setTimeout` to fire. Awaiting the returned
 * promise blocks until cancellation has propagated AND the 'cancelled' → 'timed-out'
 * state flip has landed.
 */
class TestEpochSession extends EpochSession {
  public triggerDeadline(): Promise<void> {
    return this.handleDeadline();
  }
}

/**
 * Minimal CheckpointProver-shaped stub: provides everything the TopTreeJob and EpochSession
 * read off a prover, without standing up the actual eager gather/sub-tree pipeline.
 *
 * Pass `blockProofsError` to simulate a checkpoint that fails to prove — its
 * `whenBlockProofsReady()` will reject with the supplied error, mirroring the production
 * path where CheckpointProver.executeCheckpoint catches an internal failure and rejects
 * its blockProofs promise.
 */
function makeStubProver(checkpoint: Checkpoint, opts: { blockProofsError?: Error } = {}): CheckpointProver {
  const id = CheckpointProver.idFor(checkpoint);
  // By default whenBlockProofsReady never resolves in these tests; the prove override
  // bypasses any path that would actually await it.
  const blockProofs: Promise<never> = opts.blockProofsError
    ? Promise.reject(opts.blockProofsError)
    : new Promise(() => {});
  // Suppress unhandled-rejection noise — tests that need the rejection observe it
  // explicitly via the proveOverride hook.
  blockProofs.catch(() => {});
  return {
    id,
    checkpoint,
    epochNumber: EpochNumber(5),
    slotNumber: checkpoint.header.slotNumber,
    attestations: [],
    previousBlockHeader: BlockHeader.empty(),
    l1ToL2Messages: [],
    previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
    txs: new Map(),
    whenBlockProofsReady: () => blockProofs,
    isCancelled: () => false,
    isCompleted: () => false,
    cancel: () => {},
    whenDone: () => Promise.resolve(),
    getAbortSignal: () => new AbortController().signal,
  } as unknown as CheckpointProver;
}

/** Builds a syntactically valid BatchedBlob — values are random but the shape is real. */
function makeBlob(): BatchedBlob {
  const pi = RootRollupPublicInputs.random();
  return new BatchedBlob(
    pi.blobPublicInputs.blobCommitmentsHash,
    pi.blobPublicInputs.z,
    pi.blobPublicInputs.y,
    pi.blobPublicInputs.c,
    pi.blobPublicInputs.c.negate(),
  );
}
