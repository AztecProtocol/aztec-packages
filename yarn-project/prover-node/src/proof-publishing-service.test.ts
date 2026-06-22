import { BatchedBlob } from '@aztec/blob-lib/types';
import { BlockNumber, CheckpointNumber, EpochNumber } from '@aztec/foundation/branded-types';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { DateProvider } from '@aztec/foundation/timer';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { Proof } from '@aztec/stdlib/proofs';
import { RootRollupPublicInputs } from '@aztec/stdlib/rollup';

import { type MockProxy, mock } from 'jest-mock-extended';

import {
  ProofPublishingService,
  type ProofPublishingServiceDeps,
  type PublishCandidate,
  type PublisherFactoryLike,
  type PublisherLike,
} from './proof-publishing-service.js';

describe('ProofPublishingService', () => {
  let publisherFactory: MockProxy<PublisherFactoryLike>;
  let publishers: MockProxy<PublisherLike>[];
  let l2BlockSource: MockProxy<Pick<L2BlockSource, 'getBlockNumber'>>;
  let dateProvider: DateProvider;
  let service: TestProofPublishingService;

  beforeEach(() => {
    publishers = [];
    publisherFactory = mock<PublisherFactoryLike>();
    publisherFactory.create.mockImplementation(() => {
      const next = newPublisher();
      publishers.push(next);
      return Promise.resolve(next as unknown as Awaited<ReturnType<PublisherFactoryLike['create']>>);
    });
    l2BlockSource = mock<Pick<L2BlockSource, 'getBlockNumber'>>();
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber.ZERO);
    dateProvider = new DateProvider();
  });

  afterEach(async () => {
    await service.stop();
  });

  function startService(overrides?: Partial<ProofPublishingServiceDeps['config']>): void {
    service = new TestProofPublishingService({
      publisherFactory,
      l2BlockSource,
      dateProvider,
      config: { skipSubmitProof: false, ...overrides },
    });
  }

  /**
   * Builds a gated publisher whose `submitEpochProof` resolves only when the test
   * releases `gate`, and exposes a `submitCalled` trigger that fires the moment the
   * publish enters the publisher (after `inFlight = { id }` has been set in
   * `publishWinner`). Lets tests deterministically wait for "drain is in-flight on the
   * publisher" without sleeping.
   */
  function installGatedPublisher(): {
    gate: ReturnType<typeof promiseWithResolvers<boolean>>;
    submitCalled: ReturnType<typeof promiseWithResolvers<void>>;
  } {
    const gate = promiseWithResolvers<boolean>();
    const submitCalled = promiseWithResolvers<void>();
    publisherFactory.create.mockImplementationOnce(() => {
      const p = newPublisher();
      p.submitEpochProof.mockImplementation(() => {
        submitCalled.resolve();
        return gate.promise;
      });
      publishers.push(p);
      return Promise.resolve(p as unknown as Awaited<ReturnType<PublisherFactoryLike['create']>>);
    });
    return { gate, submitCalled };
  }

  function newPublisher(): MockProxy<PublisherLike> {
    const p = mock<PublisherLike>();
    p.submitEpochProof.mockResolvedValue(true);
    p.analyzeEpochProofSubmission.mockResolvedValue(undefined);
    return p;
  }

  /** Build a candidate with sensible defaults — caller overrides only what matters per test. */
  function makeCandidate(overrides: Partial<PublishCandidate> = {}): PublishCandidate {
    const startBlock = overrides.startBlock ?? BlockNumber(1);
    const endBlock = overrides.endBlock ?? BlockNumber(8);
    return {
      id: overrides.id ?? `cand-${Math.random().toString(36).slice(2, 9)}`,
      epoch: overrides.epoch ?? EpochNumber(1),
      kind: overrides.kind ?? 'full',
      startBlock,
      endBlock,
      deadline: overrides.deadline,
      fromCheckpoint: overrides.fromCheckpoint ?? CheckpointNumber(1),
      toCheckpoint: overrides.toCheckpoint ?? CheckpointNumber(1),
      publicInputs: overrides.publicInputs ?? RootRollupPublicInputs.random(),
      proof: overrides.proof ?? Proof.empty(),
      batchedBlobInputs: overrides.batchedBlobInputs ?? makeBlob(),
      attestations: overrides.attestations ?? [],
      headers: overrides.headers ?? [],
    };
  }

  // ---------------- happy path ----------------

  it('publishes a single eligible candidate', async () => {
    startService();
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(0)); // predecessor proven (startBlock=1, so 0 is enough).
    const candidate = makeCandidate({ startBlock: BlockNumber(1), endBlock: BlockNumber(8) });

    const outcome = await service.submit(candidate);

    expect(outcome).toEqual('published');
    expect(publishers).toHaveLength(1);
    expect(publishers[0].submitEpochProof).toHaveBeenCalledTimes(1);
  });

  it('waits for predecessor before publishing', async () => {
    startService();
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(0)); // predecessor not proven (need >= 4).
    const candidate = makeCandidate({ startBlock: BlockNumber(5), endBlock: BlockNumber(8) });

    const outcomePromise = service.submit(candidate);
    await service.drainSyncPoint(); // drain runs, picks no winner, returns
    expect(publishers).toHaveLength(0);

    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(4)); // predecessor now proven.
    service.onChainProven(BlockNumber(4));

    expect(await outcomePromise).toEqual('published');
    expect(publishers).toHaveLength(1);
  });

  // ---------------- dedup / supersession ----------------

  it('supersedes a partial candidate fully covered by the proven tip', async () => {
    startService();
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(8));
    const candidate = makeCandidate({
      kind: 'partial',
      startBlock: BlockNumber(1),
      endBlock: BlockNumber(8),
    });

    const outcome = await service.submit(candidate);

    expect(outcome).toEqual('superseded');
    expect(publishers).toHaveLength(0);
  });

  it('still publishes a full candidate when the proven tip already covers its range', async () => {
    // Multi-prover-node case: every prover-node submits its own full epoch proof; the L1
    // rollup records each (prover-id, epoch) tuple. The publishing service must not
    // suppress a redundant full proof just because some other prover-node landed first.
    startService();
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(8));
    const candidate = makeCandidate({ kind: 'full', startBlock: BlockNumber(1), endBlock: BlockNumber(8) });

    const outcome = await service.submit(candidate);

    expect(outcome).toEqual('published');
    expect(publishers).toHaveLength(1);
    expect(publishers[0].submitEpochProof).toHaveBeenCalledTimes(1);
  });

  it('publishes the longest candidate when several are eligible for the same epoch', async () => {
    startService();
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(0));
    const shortCandidate = makeCandidate({
      id: 'short',
      epoch: EpochNumber(1),
      startBlock: BlockNumber(1),
      endBlock: BlockNumber(3),
    });
    const longCandidate = makeCandidate({
      id: 'long',
      epoch: EpochNumber(1),
      startBlock: BlockNumber(1),
      endBlock: BlockNumber(8),
      toCheckpoint: CheckpointNumber(2),
    });

    // Submit both before drain runs so they're considered together.
    const shortOutcome = service.submit(shortCandidate);
    const longOutcome = service.submit(longCandidate);

    expect(await shortOutcome).toEqual('superseded');
    expect(await longOutcome).toEqual('published');
    expect(publishers).toHaveLength(1);
    expect(publishers[0].submitEpochProof).toHaveBeenCalledWith(
      expect.objectContaining({ toCheckpoint: CheckpointNumber(2) }),
    );
  });

  // ---------------- withdraw ----------------

  it('withdraws a queued candidate without calling the publisher', async () => {
    startService();
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(0));
    const candidate = makeCandidate({ startBlock: BlockNumber(5), endBlock: BlockNumber(8) }); // not eligible.

    const outcomePromise = service.submit(candidate);
    await service.drainSyncPoint(); // drain runs, parks the candidate (not eligible)
    service.withdraw(candidate.id);

    expect(await outcomePromise).toEqual('withdrawn');
    expect(publishers).toHaveLength(0);
  });

  it('lets an in-flight publish run to completion when withdraw is called on it', async () => {
    // Once a publish starts, withdraw is a no-op for the in-flight candidate — the L1
    // submission runs naturally and the outcome reports whatever the publisher returned.
    // The originating session is expected to have moved to a terminal state via cancel()
    // and ignore the late outcome.
    startService();
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(0));

    const { gate, submitCalled } = installGatedPublisher();
    const candidate = makeCandidate();
    const outcomePromise = service.submit(candidate);

    await submitCalled.promise; // inFlight = { id } now set; drain is awaiting submitEpochProof
    expect(publishers).toHaveLength(1);

    // Withdraw mid-publish: service does not touch the publisher, the publish keeps running.
    service.withdraw(candidate.id);

    // Release the publish — outcome reports the publisher's natural return value.
    gate.resolve(true);
    expect(await outcomePromise).toEqual('published');
  });

  // ---------------- expiry ----------------

  it('resolves as expired when the deadline elapses before publishing', async () => {
    startService();
    // Predecessor not proven — candidate sits in the queue.
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(0));
    const candidate = makeCandidate({
      startBlock: BlockNumber(5),
      endBlock: BlockNumber(8),
      deadline: new Date(Date.now() + 20),
    });

    expect(await service.submit(candidate)).toEqual('expired');
    expect(publishers).toHaveLength(0);
  });

  it('expires a candidate whose deadline is already in the past at submit time', async () => {
    startService();
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(0));
    const candidate = makeCandidate({
      startBlock: BlockNumber(5),
      endBlock: BlockNumber(8),
      deadline: new Date(Date.now() - 1000),
    });

    expect(await service.submit(candidate)).toEqual('expired');
    expect(publishers).toHaveLength(0);
  });

  it('lets an in-flight publish complete past its deadline', async () => {
    // Once a publish starts, the deadline timer becomes a no-op. The publish runs to
    // completion and the outcome reports the publisher's result.
    startService();
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(0));

    const { gate, submitCalled } = installGatedPublisher();
    // Deadline far enough out that the real timer never fires within the test — we drive
    // expiry manually via triggerExpiry below.
    const candidate = makeCandidate({ deadline: new Date(Date.now() + 60_000) });
    const outcomePromise = service.submit(candidate);

    await submitCalled.promise; // inFlight is set; publish is awaiting the gate
    expect(publishers).toHaveLength(1);

    // Drive the deadline path manually. inFlight matches the candidate id, so handleExpiry
    // is a no-op — the publish keeps running.
    service.triggerExpiry(candidate.id);
    gate.resolve(true);
    expect(await outcomePromise).toEqual('published');
  });

  // ---------------- failure surfaces ----------------

  it('resolves as failed when submitEpochProof returns false', async () => {
    startService();
    publisherFactory.create.mockImplementationOnce(() => {
      const p = newPublisher();
      p.submitEpochProof.mockResolvedValue(false);
      publishers.push(p);
      return Promise.resolve(p as unknown as Awaited<ReturnType<PublisherFactoryLike['create']>>);
    });

    const outcome = await service.submit(makeCandidate());
    expect(outcome).toEqual('failed');
  });

  it('resolves as failed when submitEpochProof throws', async () => {
    startService();
    publisherFactory.create.mockImplementationOnce(() => {
      const p = newPublisher();
      p.submitEpochProof.mockRejectedValue(new Error('boom'));
      publishers.push(p);
      return Promise.resolve(p as unknown as Awaited<ReturnType<PublisherFactoryLike['create']>>);
    });

    const outcome = await service.submit(makeCandidate());
    expect(outcome).toEqual('failed');
  });

  it('retries the publish when publisherFactory.create transiently fails', async () => {
    // Pool exhaustion is transient — we must not fail the proof, just back off and try
    // again on a later drain. Once create() succeeds, the candidate publishes normally.
    startService();
    let createCalls = 0;
    publisherFactory.create.mockImplementation(() => {
      createCalls++;
      if (createCalls < 3) {
        return Promise.reject(new Error('pool exhausted'));
      }
      const p = newPublisher();
      publishers.push(p);
      return Promise.resolve(p as unknown as Awaited<ReturnType<PublisherFactoryLike['create']>>);
    });

    const outcome = service.submit(makeCandidate());

    // First drain attempts create() and fails; publishWinner schedules a setTimeout
    // retry. We bypass the timer by driving the next drain via onChainProven, which
    // shares the same scheduleDrain mechanism. This loses direct coverage of the
    // 1000ms retry delay but exercises the retry *behaviour* deterministically.
    await service.drainSyncPoint();
    expect(publishers).toHaveLength(0);
    expect(createCalls).toBe(1);

    service.onChainProven(BlockNumber(0)); // wake the drain again
    await service.drainSyncPoint();
    expect(publishers).toHaveLength(0);
    expect(createCalls).toBe(2);

    service.onChainProven(BlockNumber(0));
    expect(await outcome).toEqual('published');
    expect(publishers).toHaveLength(1);
    expect(createCalls).toBe(3);
  });

  it('expires a candidate that keeps hitting publisher acquire failures past its deadline', async () => {
    // Persistent acquire failure + a short deadline: the expiry timer wins.
    startService();
    publisherFactory.create.mockRejectedValue(new Error('pool exhausted'));

    const candidate = makeCandidate({ deadline: new Date(Date.now() + 50) });
    expect(await service.submit(candidate)).toEqual('expired');
    expect(publishers).toHaveLength(0);
  });

  // ---------------- skipSubmitProof ----------------

  it('routes to analyzeEpochProofSubmission when skipSubmitProof is true', async () => {
    startService({ skipSubmitProof: true });
    const outcome = await service.submit(makeCandidate());

    expect(outcome).toEqual('published');
    expect(publishers).toHaveLength(1);
    expect(publishers[0].analyzeEpochProofSubmission).toHaveBeenCalledTimes(1);
    expect(publishers[0].submitEpochProof).not.toHaveBeenCalled();
  });

  // ---------------- serialisation ----------------

  it('drains one publish at a time — no concurrent publishes', async () => {
    startService();
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(0));

    // Hand back publishers whose submitEpochProof completes only when we say. Each gated
    // publisher exposes a submitCalled trigger that fires once the publish actually starts
    // (inFlight = { id } has been set in publishWinner).
    const first = installGatedPublisher();
    const second = installGatedPublisher();

    // Both candidates need their predecessor proven from the start so the drain doesn't park
    // the second behind the first. The unit test ignores real block-number sequencing —
    // what matters is that two eligible candidates publish serially, not in parallel.
    const a = service.submit(
      makeCandidate({ epoch: EpochNumber(1), startBlock: BlockNumber(1), endBlock: BlockNumber(2) }),
    );
    const b = service.submit(
      makeCandidate({ epoch: EpochNumber(2), startBlock: BlockNumber(1), endBlock: BlockNumber(4) }),
    );

    // Only the first publish should be in flight.
    await first.submitCalled.promise;
    expect(publishers).toHaveLength(1);

    // Release first; the second drain pass now runs and starts the second publish.
    first.gate.resolve(true);
    await a;
    await second.submitCalled.promise;
    expect(publishers).toHaveLength(2);

    second.gate.resolve(true);
    expect(await b).toEqual('published');
  });

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
});

/**
 * Subclass that exposes the protected `drainQueue.syncPoint()` and `handleExpiry` for
 * test triggers. Lets tests wait for the drain to settle and drive deadline expiry
 * without relying on real setTimeouts.
 */
class TestProofPublishingService extends ProofPublishingService {
  public drainSyncPoint(): Promise<void> {
    return this.drainQueue.syncPoint();
  }

  public triggerExpiry(candidateId: string): void {
    this.handleExpiry(candidateId);
  }
}
