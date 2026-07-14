import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { DateProvider } from '@aztec/foundation/timer';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';
import type { EpochProvingJobState } from '@aztec/stdlib/interfaces/server';

import { mock } from 'jest-mock-extended';

import type { CheckpointStore } from './checkpoint-store.js';
import { CheckpointProver } from './job/checkpoint-prover.js';
import { EpochSession, type SessionSpec } from './job/epoch-session.js';
import { ProverNodeJobMetrics } from './metrics.js';
import type { ProofPublishingService } from './proof-publishing-service.js';
import { SessionManager, type SessionManagerDeps } from './session-manager.js';

describe('SessionManager', () => {
  // Two-slot epochs let a single epoch hold canonical checkpoints at distinct slots.
  // Epoch N covers slots [N*2, N*2+1]: epoch 3 → [6, 7], epoch 4 → [8, 9], epoch 7 → [14, 15].
  const l1Constants = { ...EmptyL1RollupConstants, epochDuration: 2 };

  let store: ReturnType<typeof mock<CheckpointStore>>;
  let l2BlockSource: ReturnType<
    typeof mock<
      Pick<L2BlockSource, 'isEpochComplete' | 'getCheckpoints' | 'getL1Constants' | 'getBlockNumber' | 'getBlockData'>
    >
  >;
  let publishingService: ReturnType<typeof mock<ProofPublishingService>>;
  let metrics: ProverNodeJobMetrics;

  /** Mirror of fullSessions/partialSessions whose entries are stubs we control. */
  let stubs: StubSession[];
  /** Resolves whenever the manager constructs a stub session. */
  let onConstruct: ((stub: StubSession) => void) | undefined;

  let manager: TestSessionManager;

  beforeEach(() => {
    store = mock<CheckpointStore>();
    l2BlockSource =
      mock<
        Pick<L2BlockSource, 'isEpochComplete' | 'getCheckpoints' | 'getL1Constants' | 'getBlockNumber' | 'getBlockData'>
      >();
    publishingService = mock<ProofPublishingService>();
    metrics = new ProverNodeJobMetrics(
      // Minimal Meter stub: every meter.create* returns an object with a no-op record.
      { createHistogram: noopMetric, createGauge: noopMetric, createCounter: noopMetric } as any,
      { startActiveSpan: (_n: string, fn: any) => fn({ end: () => {} }) } as any,
    );
    l2BlockSource.getL1Constants.mockResolvedValue(l1Constants);
    l2BlockSource.isEpochComplete.mockResolvedValue(false);
    l2BlockSource.getCheckpoints.mockResolvedValue([]);
    store.listInSlotRange.mockReturnValue([]);
    store.listForEpoch.mockResolvedValue([]);

    stubs = [];
    onConstruct = undefined;

    manager = new TestSessionManager(
      {
        checkpointStore: store,
        l2BlockSource,
        proverFactory: {} as any,
        proverId: EthAddress.ZERO,
        publishingService,
        metrics,
        dateProvider: new DateProvider(),
        config: { maxPendingJobs: 0, tickIntervalMs: 60_000, finalizationDelayMs: undefined },
      },
      (spec, provers) => {
        const stub = makeStubSession(spec, provers);
        stubs.push(stub);
        onConstruct?.(stub);
        return stub as unknown as EpochSession;
      },
    );
  });

  afterEach(async () => {
    // Resolve any stub session that's still waiting so manager.stop() can drain.
    for (const stub of stubs) {
      stub.terminate('cancelled');
    }
    await manager.stop();
  });

  // ---------------- read views ----------------

  it('getJobs returns empty when no sessions exist', () => {
    expect(manager.getJobs()).toEqual([]);
  });

  it('getJobs reports every live session', async () => {
    await openCanonicalFullSession(EpochNumber(5), [proverWithSlot(10)]);
    const jobs = manager.getJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].epochNumber).toEqual(EpochNumber(5));
    expect(jobs[0].status).toBe('awaiting-checkpoints');
  });

  // ---------------- opening full sessions ----------------

  it('does not open a full session when the epoch is incomplete on L1', async () => {
    const epoch = EpochNumber(3);
    l2BlockSource.isEpochComplete.mockResolvedValue(false);
    await manager.onCheckpointAdded(epoch);
    expect(stubs.length).toBe(0);
    expect(manager.getFullSession(epoch)).toBeUndefined();
  });

  it('does not open a full session when archiver checkpoints are not all in the store', async () => {
    const epoch = EpochNumber(3);
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpoints.mockResolvedValue([archiverCp(1, 6), archiverCp(2, 7)]);
    // Store only has checkpoint 1.
    store.listInSlotRange.mockReturnValue([proverForCheckpoint(1, 6)]);
    await manager.onCheckpointAdded(epoch);
    expect(stubs.length).toBe(0);
    expect(manager.getFullSession(epoch)).toBeUndefined();
  });

  it('opens a full session when epoch complete + store fully covered', async () => {
    const epoch = EpochNumber(3);
    // Two canonical checkpoints at distinct slots within epoch 3's range [6, 7].
    const provers = [proverForCheckpoint(1, 6), proverForCheckpoint(2, 7)];
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpoints.mockResolvedValue([archiverCp(1, 6), archiverCp(2, 7)]);
    store.listInSlotRange.mockReturnValue(provers);

    await manager.onCheckpointAdded(epoch);

    expect(stubs.length).toBe(1);
    expect(stubs[0].spec).toEqual({ kind: 'full', epochNumber: epoch, fromSlot: SlotNumber(6), toSlot: SlotNumber(7) });
    expect(stubs[0].provers).toEqual(provers);
    expect(manager.getFullSession(epoch)).toBe(stubs[0] as unknown as EpochSession);
  });

  it('does not open a duplicate full session if one already exists', async () => {
    const epoch = EpochNumber(3);
    await openCanonicalFullSession(epoch, [proverForCheckpoint(1, 6)]);
    expect(stubs.length).toBe(1);
    await manager.onCheckpointAdded(epoch);
    expect(stubs.length).toBe(1);
  });

  it('respects maxPendingJobs when opening full sessions', async () => {
    manager = new TestSessionManager(
      {
        checkpointStore: store,
        l2BlockSource,
        proverFactory: {} as any,
        proverId: EthAddress.ZERO,
        publishingService,
        metrics,
        dateProvider: new DateProvider(),
        config: { maxPendingJobs: 1, tickIntervalMs: 60_000, finalizationDelayMs: undefined },
      },
      (spec, provers) => {
        const stub = makeStubSession(spec, provers);
        stubs.push(stub);
        return stub as unknown as EpochSession;
      },
    );

    // Persistent mock implementations keyed by slot so reconcile's invariant checks
    // see consistent content for each session across multiple events. Epoch 3 → slot 6,
    // epoch 4 → slot 8 (each epoch's first slot under epochDuration=2).
    const epoch3Provers = [proverForCheckpoint(1, 6)];
    const epoch4Provers = [proverForCheckpoint(2, 8)];
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpoints.mockImplementation(({ epoch }: { epoch: EpochNumber }) =>
      Promise.resolve(
        (Number(epoch) === 3 ? epoch3Provers : Number(epoch) === 4 ? epoch4Provers : []).map(
          p => ({ checkpoint: p.checkpoint }) as any,
        ),
      ),
    );
    store.listInSlotRange.mockImplementation((fromSlot: SlotNumber) => {
      if (Number(fromSlot) === 6) {
        return epoch3Provers;
      }
      if (Number(fromSlot) === 8) {
        return epoch4Provers;
      }
      return [];
    });

    await manager.onCheckpointAdded(EpochNumber(3));
    expect(stubs.length).toBe(1);
    // At the cap — second epoch is skipped.
    await manager.onCheckpointAdded(EpochNumber(4));
    expect(stubs.length).toBe(1);
    expect(manager.getFullSession(EpochNumber(4))).toBeUndefined();
  });

  // ---------------- onTick ----------------

  it('onTick opens a full session for the next unproven epoch', async () => {
    // Proven tip at block 2; block 3 (first unproven) sits at slot 6, which is in epoch 3
    // under epochDuration=2.
    mockNextUnprovenSlot(2, 6);
    const provers = [proverForCheckpoint(1, 6)];
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpoints.mockResolvedValue([archiverCp(1, 6)]);
    store.listInSlotRange.mockReturnValue(provers);

    await manager.onTick();
    expect(manager.getFullSession(EpochNumber(3))).toBeDefined();
  });

  it('onTick does nothing when the next checkpoint to prove is not yet in the store', async () => {
    mockNextUnprovenSlot(2, undefined);
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    await manager.onTick();
    expect(stubs.length).toBe(0);
  });

  it('onTick does not open a session when the next epoch is incomplete', async () => {
    mockNextUnprovenSlot(2, 6);
    l2BlockSource.isEpochComplete.mockResolvedValue(false);
    await manager.onTick();
    expect(stubs.length).toBe(0);
    expect(manager.getFullSession(EpochNumber(3))).toBeUndefined();
  });

  it('onTick does not re-open a session that already exists', async () => {
    mockNextUnprovenSlot(2, 6);
    const provers = [proverForCheckpoint(1, 6)];
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpoints.mockResolvedValue([archiverCp(1, 6)]);
    store.listInSlotRange.mockReturnValue(provers);

    await manager.onTick();
    expect(stubs.length).toBe(1);
    // A second tick with the same proven height must not open a duplicate.
    await manager.onTick();
    expect(stubs.length).toBe(1);
  });

  it('onTick does not re-attempt a stopped epoch, but a checkpoint event reopens it', async () => {
    // A faulted attempt settles the session in the non-declaring terminal 'stopped'. The tick is gated
    // by its high-water mark (lastTickEpoch), so it opens the epoch once and does not re-create (and
    // re-prove) a session for it every tick. Recovery comes through the ungated checkpoint trigger — a
    // re-add is a genuine change that may now succeed.
    mockNextUnprovenSlot(2, 6);
    const provers = [proverForCheckpoint(1, 6)];
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpoints.mockResolvedValue([archiverCp(1, 6)]);
    store.listInSlotRange.mockReturnValue(provers);

    await manager.onTick();
    expect(stubs.length).toBe(1);

    stubs[0].terminate('stopped');
    await flushSessionCompletion();

    // Further ticks must NOT re-create a session over the same (already-failed) content.
    await manager.onTick();
    await manager.onTick();
    expect(stubs.length).toBe(1);
    expect(manager.getFullSession(EpochNumber(3))).toBeUndefined();

    // A checkpoint event for the epoch is ungated and reopens a fresh, live session.
    await manager.onCheckpointAdded(EpochNumber(3));
    const reopened = manager.getFullSession(EpochNumber(3)) as unknown as StubSession | undefined;
    expect(reopened).toBeDefined();
    expect(reopened).not.toBe(stubs[0]);
    expect(reopened!.isTerminal()).toBe(false);
    expect(stubs.length).toBe(2);
  });

  it('onTick stops retrying once the epoch is proven (proven height advances past it)', async () => {
    // Retry-to-converge terminates for free: once the epoch is proven, the proven tip advances so
    // nextUnprovenEpoch moves on and the tick no longer selects the proven epoch.
    mockNextUnprovenSlot(2, 6); // proven tip block 2 → first unproven slot 6 → epoch 3
    const provers = [proverForCheckpoint(1, 6)];
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpoints.mockResolvedValue([archiverCp(1, 6)]);
    store.listInSlotRange.mockReturnValue(provers);

    await manager.onTick();
    expect(stubs.length).toBe(1);
    stubs[0].terminate('stopped');
    await flushSessionCompletion();

    // Proven height jumps past epoch 3's blocks: the next unproven block is now in a later epoch.
    mockNextUnprovenSlot(8, 8); // epoch 4
    l2BlockSource.getCheckpoints.mockResolvedValue([]); // epoch 4 has no canonical content yet
    store.listInSlotRange.mockReturnValue([]);

    await manager.onTick();
    await manager.onTick();
    // No new session for epoch 3 — it is proven; nothing opened for the empty epoch 4 either.
    expect(manager.getFullSession(EpochNumber(3))).toBeUndefined();
    expect(stubs.length).toBe(1);
  });

  it('onTick keeps retrying the same epoch while a transient blocker prevents opening', async () => {
    // The archiver is still indexing — getCheckpoints returns a checkpoint we don't yet
    // have in the store. openFullSessionIfReady should bail without creating a session,
    // and the next tick must try again rather than skip the epoch.
    mockNextUnprovenSlot(2, 6);
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpoints.mockResolvedValue([archiverCp(1, 6)]);
    store.listInSlotRange.mockReturnValue([]); // store hasn't indexed it yet

    await manager.onTick();
    expect(stubs.length).toBe(0); // no session created
    await manager.onTick();
    expect(stubs.length).toBe(0); // still no session — the tick keeps trying

    // Archiver catches up; the next tick succeeds.
    store.listInSlotRange.mockReturnValue([proverForCheckpoint(1, 6)]);
    await manager.onTick();
    expect(stubs.length).toBe(1);
    expect(manager.getFullSession(EpochNumber(3))).toBe(stubs[0] as unknown as EpochSession);
  });

  // ---------------- session invalidation on prune ----------------

  it('cancels and recreates a session whose canonical content changed', async () => {
    const epoch = EpochNumber(3);
    // Two checkpoints at distinct slots within epoch 3's range [6, 7].
    const initial = [proverForCheckpoint(1, 6), proverForCheckpoint(2, 7)];
    await openCanonicalFullSession(epoch, initial);
    const original = stubs[0];

    // Now the store reports only the first prover.
    store.listInSlotRange.mockReturnValue([initial[0]]);
    await manager.onPrune([epoch]);

    expect(original.cancelled).toBe(true);
    expect(original.state).toBe('cancelled');
    expect(original.isTerminal()).toBe(true);
    expect(original.cancelReasons).toEqual(['canonical content changed']);
    expect(stubs.length).toBe(2);
    const recreated = stubs[1];
    expect(recreated.provers).toEqual([initial[0]]);
    expect(recreated.spec).toEqual(original.spec); // same slot range, fresh prover set
    expect(recreated.state).toBe('awaiting-checkpoints');
    expect(recreated.isTerminal()).toBe(false);
    expect(recreated.uuid).not.toBe(original.uuid);
    expect(manager.getFullSession(epoch)).toBe(recreated as unknown as EpochSession);
  });

  it('drops a session and does not recreate when canonical content goes empty', async () => {
    const epoch = EpochNumber(3);
    await openCanonicalFullSession(epoch, [proverForCheckpoint(1, 6)]);
    const original = stubs[0];

    store.listInSlotRange.mockReturnValue([]);
    await manager.onPrune([epoch]);

    expect(original.cancelled).toBe(true);
    expect(original.state).toBe('cancelled');
    expect(original.cancelReasons).toEqual(['canonical content changed']);
    expect(manager.getFullSession(epoch)).toBeUndefined();
    expect(stubs.length).toBe(1);
  });

  it('reopens an epoch session after all its checkpoints are pruned and then re-added', async () => {
    // The race flagged in review: a reorg removes every checkpoint of an epoch, then new
    // ones arrive. Hitting the empty state first is benign — the session is dropped with
    // no error, and the re-add opens a fresh session for the same epoch.
    const epoch = EpochNumber(3);
    const prover = proverForCheckpoint(1, 6);
    await openCanonicalFullSession(epoch, [prover]);
    const original = stubs[0];

    // Reorg removes every checkpoint of the epoch → session dropped, not recreated.
    store.listInSlotRange.mockReturnValue([]);
    await manager.onPrune([epoch]);
    expect(original.cancelled).toBe(true);
    expect(original.state).toBe('cancelled');
    expect(manager.getFullSession(epoch)).toBeUndefined();

    // A new checkpoint for the same epoch arrives → a fresh session opens.
    await openCanonicalFullSession(epoch, [prover]);
    const recreated = manager.getFullSession(epoch) as unknown as StubSession | undefined;
    expect(recreated).toBeDefined();
    expect(recreated).not.toBe(original);
    expect(recreated!.uuid).not.toBe(original.uuid);
    expect(recreated!.getCheckpoints()).toEqual([prover]);
    expect(recreated!.state).toBe('awaiting-checkpoints');
    expect(recreated!.isTerminal()).toBe(false);
    expect(stubs.length).toBe(2);
  });

  it('reopens an epoch whose session stopped once its checkpoints are re-added', async () => {
    // A data-plane reorg fault rejects a checkpoint's blockProofs mid-proof, settling the session in
    // the non-declaring terminal 'stopped'. That must not strand the epoch — a re-add of its
    // checkpoints reopens a fresh, live session via the checkpoint trigger.
    const epoch = EpochNumber(3);
    const prover = proverForCheckpoint(1, 6);
    await openCanonicalFullSession(epoch, [prover]);
    const original = stubs[0];

    original.terminate('stopped');
    await flushSessionCompletion();
    expect(original.state).toBe('stopped');

    await openCanonicalFullSession(epoch, [prover]);
    const recreated = manager.getFullSession(epoch) as unknown as StubSession | undefined;
    expect(recreated).toBeDefined();
    expect(recreated).not.toBe(original);
    expect(recreated!.uuid).not.toBe(original.uuid);
    expect(recreated!.isTerminal()).toBe(false);
    expect(stubs.length).toBe(2);
  });

  it('data-plane fault then identical-content re-add: rebuilds over the same content and completes', async () => {
    // A checkpoint prover faults mid-proof from a data-plane reorg (its blockProofs reject), so the
    // session settles in 'stopped' — not 'failed'. The checkpoint is then re-added with identical
    // content (same content-addressed id). The epoch is rebuilt over the replacement prover and
    // completes. Building over the same content id is exactly what lets the (content-addressed) broker
    // reuse the already-completed sub-tree proofs — see checkpoint-store.test.ts for the reuse itself.
    const epoch = EpochNumber(3);
    const original = proverForCheckpoint(1, 6);
    await openCanonicalFullSession(epoch, [original]);
    const faulted = stubs[0];

    faulted.terminate('stopped');
    await flushSessionCompletion();
    expect(faulted.state).toBe('stopped');

    // Re-add with identical content: same (number, slot) ⇒ same content-addressed id as the faulted one.
    const readded = proverForCheckpoint(1, 6);
    expect(readded.id).toBe(original.id);
    await openCanonicalFullSession(epoch, [readded]);

    const rebuilt = manager.getFullSession(epoch) as unknown as StubSession | undefined;
    expect(rebuilt).toBeDefined();
    expect(rebuilt).not.toBe(faulted);
    expect(rebuilt!.isTerminal()).toBe(false);
    expect(rebuilt!.provers.map(p => p.id)).toEqual([original.id]);
    expect(stubs.length).toBe(2);

    // The rebuilt session proves the epoch to completion.
    rebuilt!.terminate('completed');
    await flushSessionCompletion();
    expect(rebuilt!.state).toBe('completed');
  });

  it('data-plane fault then different-content re-add: rebuilds over the new content and completes', async () => {
    // Same data-plane fault, but the reorg replaces the epoch's content: the re-added checkpoint has a
    // different content-addressed id. The epoch is rebuilt over the NEW prover (nothing to reuse) and
    // completes.
    const epoch = EpochNumber(3);
    const original = proverForCheckpoint(1, 6);
    await openCanonicalFullSession(epoch, [original]);
    const faulted = stubs[0];

    faulted.terminate('stopped');
    await flushSessionCompletion();

    // Re-add with different content within epoch 3's slot range [6, 7] ⇒ a distinct content id.
    const readded = proverForCheckpoint(2, 7);
    expect(readded.id).not.toBe(original.id);
    await openCanonicalFullSession(epoch, [readded]);

    const rebuilt = manager.getFullSession(epoch) as unknown as StubSession | undefined;
    expect(rebuilt).toBeDefined();
    expect(rebuilt).not.toBe(faulted);
    expect(rebuilt!.isTerminal()).toBe(false);
    expect(rebuilt!.provers.map(p => p.id)).toEqual([readded.id]);
    expect(stubs.length).toBe(2);

    rebuilt!.terminate('completed');
    await flushSessionCompletion();
    expect(rebuilt!.state).toBe('completed');
  });

  it('drops terminal sessions on the next reconcile', async () => {
    const epoch = EpochNumber(3);
    await openCanonicalFullSession(epoch, [proverForCheckpoint(1, 6)]);
    const original = stubs[0];
    original.terminate('completed');
    // Trigger a reconcile.
    await manager.onTick();
    expect(manager.getFullSession(epoch)).toBeUndefined();
    expect(stubs.length).toBe(1); // no replacement constructed
    // Terminal-drop path is quiet: the manager does NOT call cancel on an already-terminal
    // session, because the cancel is redundant.
    expect(original.cancelReasons).toEqual([]);
    expect(original.cancelled).toBe(false); // cancel() was never invoked; state is 'completed'
    expect(original.state).toBe('completed');
  });

  // ---------------- partial-session cleanup ----------------

  it('cancels and recreates a partial session whose canonical content changed', async () => {
    const epoch = EpochNumber(7);
    const initial = [proverForCheckpoint(1, 14)];
    store.listForEpoch.mockResolvedValue(initial);
    store.listInSlotRange.mockReturnValue(initial);

    const stubPromise = awaitNextStub();
    const startPromise = manager.startProof(epoch);
    const original = await stubPromise;
    expect(original.spec.kind).toBe('partial');
    expect(original.provers).toEqual(initial);

    // The store now reports a different prover at the same slot.
    const swapped = [proverForCheckpoint(2, 14)];
    store.listInSlotRange.mockReturnValue(swapped);

    const recreatePromise = awaitNextStub();
    await manager.onTick();
    const recreated = await recreatePromise;

    expect(original.cancelled).toBe(true);
    expect(original.state).toBe('cancelled');
    expect(original.cancelReasons).toEqual(['canonical content changed']);
    expect(recreated.spec).toEqual(original.spec);
    expect(recreated.provers).toEqual(swapped);
    expect(recreated.state).toBe('awaiting-checkpoints');
    expect(recreated.uuid).not.toBe(original.uuid);
    expect(manager.getPartialSession(original.spec)).toBe(recreated as unknown as EpochSession);
    expect(stubs).toHaveLength(2);

    // startProof resolves with the scheduled job id as soon as the session is constructed.
    await startPromise;
  });

  it('drops a partial session and does not recreate when canonical content goes empty', async () => {
    const epoch = EpochNumber(7);
    const initial = [proverForCheckpoint(1, 14)];
    store.listForEpoch.mockResolvedValue(initial);
    store.listInSlotRange.mockReturnValue(initial);

    const stubPromise = awaitNextStub();
    const startPromise = manager.startProof(epoch);
    const original = await stubPromise;

    store.listInSlotRange.mockReturnValue([]);
    await manager.onTick();

    expect(original.cancelled).toBe(true);
    expect(original.state).toBe('cancelled');
    expect(original.cancelReasons).toEqual(['canonical content changed']);
    expect(manager.getPartialSession(original.spec)).toBeUndefined();
    expect(stubs).toHaveLength(1); // no replacement constructed
    await startPromise;
  });

  it('drops terminal partial sessions on the next reconcile', async () => {
    const epoch = EpochNumber(7);
    const canonical = [proverForCheckpoint(1, 14)];
    store.listForEpoch.mockResolvedValue(canonical);
    store.listInSlotRange.mockReturnValue(canonical);

    const stubPromise = awaitNextStub();
    const startPromise = manager.startProof(epoch);
    const partial = await stubPromise;

    partial.terminate('completed');
    await startPromise;
    expect(manager.getPartialSession(partial.spec)).toBe(partial as unknown as EpochSession); // still in map

    // Any subsequent reconcile drops the terminal entry without cancelling it.
    await manager.onTick();
    expect(manager.getPartialSession(partial.spec)).toBeUndefined();
    expect(partial.cancelReasons).toEqual([]);
    expect(partial.state).toBe('completed');
  });

  // ---------------- startProof ignores terminal sessions ----------------

  it('startProof ignores a terminal full session and constructs a fresh partial', async () => {
    // Existing full session that already terminated (e.g. it previously failed). startProof
    // must NOT dedupe against it — it should construct a fresh partial instead.
    const epoch = EpochNumber(7);
    const canonical = [proverForCheckpoint(1, 14)];
    await openCanonicalFullSession(epoch, canonical);
    const terminalFull = stubs[0];
    terminalFull.terminate('stopped');
    expect(terminalFull.isTerminal()).toBe(true);

    store.listForEpoch.mockResolvedValue(canonical);
    store.listInSlotRange.mockReturnValue(canonical);

    const stubPromise = awaitNextStub();
    const startPromise = manager.startProof(epoch);
    const partial = await stubPromise;

    expect(partial.spec.kind).toBe('partial');
    expect(partial.spec.epochNumber).toEqual(epoch);
    expect(partial).not.toBe(terminalFull);
    expect(manager.getPartialSession(partial.spec)).toBe(partial as unknown as EpochSession);

    partial.terminate('completed');
    await startPromise;
  });

  it('startProof ignores a terminal partial session and constructs a fresh one', async () => {
    const epoch = EpochNumber(7);
    const canonical = [proverForCheckpoint(1, 14)];
    store.listForEpoch.mockResolvedValue(canonical);
    store.listInSlotRange.mockReturnValue(canonical);

    // Open a partial, settle it terminally, then call startProof again.
    const firstPromise = awaitNextStub();
    const firstStart = manager.startProof(epoch);
    const firstPartial = await firstPromise;
    firstPartial.terminate('stopped');
    await firstStart;
    expect(firstPartial.isTerminal()).toBe(true);

    // Second startProof must construct a fresh partial.
    const secondPromise = awaitNextStub();
    const secondStart = manager.startProof(epoch);
    const secondPartial = await secondPromise;

    expect(secondPartial).not.toBe(firstPartial);
    expect(secondPartial.uuid).not.toBe(firstPartial.uuid);
    expect(secondPartial.spec).toEqual(firstPartial.spec);
    expect(secondPartial.state).toBe('awaiting-checkpoints');
    expect(stubs).toHaveLength(2);

    secondPartial.terminate('completed');
    await secondStart;
  });

  // ---------------- startProof ----------------

  it('startProof opens a partial session with fromSlot = firstSlotOfEpoch', async () => {
    const epoch = EpochNumber(7);
    // Epoch 7 covers slots [14, 15]. Single canonical prover at slot 14.
    const canonical = [proverForCheckpoint(1, 14)];
    store.listForEpoch.mockResolvedValue(canonical);
    store.listInSlotRange.mockReturnValue(canonical);

    // Arm the construction trigger before calling startProof — no need to sleep waiting
    // for reconcile to land.
    const stubPromise = awaitNextStub();
    const done = manager.startProof(epoch);
    const partial = await stubPromise;

    expect(stubs.length).toBe(1);
    expect(partial.spec).toEqual({
      kind: 'partial',
      epochNumber: epoch,
      fromSlot: SlotNumber(14),
      toSlot: SlotNumber(14),
    });
    expect(partial.provers).toEqual(canonical);
    expect(partial.state).toBe('awaiting-checkpoints');
    expect(partial.isTerminal()).toBe(false);
    expect(manager.getPartialSession(partial.spec)).toBe(partial as unknown as EpochSession);

    // startProof returns the job id without awaiting completion; await the resolved id.
    await done;
    partial.terminate('completed');
  });

  it('startProof throws when the epoch has no canonical content', async () => {
    store.listForEpoch.mockResolvedValue([]);
    await expect(manager.startProof(EpochNumber(7))).rejects.toThrow(/No blocks found/);
  });

  it('startProof refuses to re-prove an epoch the proven chain already encompasses', async () => {
    const epoch = EpochNumber(7);
    // proverForCheckpoint builds a checkpoint whose single block number equals the checkpoint
    // number (1 here). A proven tip at or beyond that block means the epoch is already proven.
    store.listForEpoch.mockResolvedValue([proverForCheckpoint(1, 14)]);
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(1));

    await expect(manager.startProof(epoch)).rejects.toThrow(/already proven/i);
    expect(stubs).toHaveLength(0);
  });

  it('startProof dedupes against an existing full session with the same range', async () => {
    const epoch = EpochNumber(7);
    // Checkpoint at the epoch's last slot (15) so the partial range startProof derives ([14,15])
    // matches the full session's range — otherwise the dedup guard wouldn't fire.
    const provers = [proverForCheckpoint(1, 15)];
    await openCanonicalFullSession(epoch, provers);
    expect(stubs.length).toBe(1);
    const fullSession = stubs[0];

    store.listForEpoch.mockResolvedValue(provers);
    const doneId = await manager.startProof(epoch);
    fullSession.terminate('completed');

    // No new session opened; startProof returned the existing full session's id.
    expect(doneId).toBe(fullSession.uuid);
    expect(stubs.length).toBe(1);
  });

  it('startProof dedupes against an existing partial session with the same spec', async () => {
    const epoch = EpochNumber(7);
    const canonical = [proverForCheckpoint(1, 14)];
    store.listForEpoch.mockResolvedValue(canonical);
    store.listInSlotRange.mockReturnValue(canonical);

    const firstId = await manager.startProof(epoch);
    expect(stubs).toHaveLength(1);
    const partial = stubs[0];
    expect(firstId).toBe(partial.uuid);

    // A second startProof for the same spec returns the existing partial's id without
    // constructing a new session or cancelling the existing one.
    const secondId = await manager.startProof(epoch);
    expect(secondId).toBe(partial.uuid);
    expect(stubs).toHaveLength(1); // no second stub ever constructed
    expect(partial.cancelReasons).toEqual([]); // dedup path never cancels the existing partial

    partial.terminate('completed');
  });

  // ---------------- stop ----------------

  it('stop cancels every live session', async () => {
    // Persistent mocks: every reconcile that runs sees consistent content for each epoch,
    // so opening epoch 4 doesn't trigger a spurious 'canonical content changed' recreate
    // of the epoch 3 session.
    const epoch3Provers = [proverForCheckpoint(1, 6)];
    const epoch4Provers = [proverForCheckpoint(2, 8)];
    l2BlockSource.isEpochComplete.mockResolvedValue(true);
    l2BlockSource.getCheckpoints.mockImplementation(({ epoch }: { epoch: EpochNumber }) =>
      Promise.resolve(
        (Number(epoch) === 3 ? epoch3Provers : Number(epoch) === 4 ? epoch4Provers : []).map(
          p => ({ checkpoint: p.checkpoint }) as any,
        ),
      ),
    );
    store.listInSlotRange.mockImplementation((fromSlot: SlotNumber) => {
      if (Number(fromSlot) === 6) {
        return epoch3Provers;
      }
      if (Number(fromSlot) === 8) {
        return epoch4Provers;
      }
      return [];
    });

    await manager.onCheckpointAdded(EpochNumber(3));
    await manager.onCheckpointAdded(EpochNumber(4));
    expect(stubs).toHaveLength(2);

    await manager.stop();

    expect(stubs.every(s => s.cancelled)).toBe(true);
    expect(stubs.every(s => s.state === 'cancelled')).toBe(true);
    expect(stubs.every(s => s.isTerminal())).toBe(true);
    // stop() passes 'prover-node stopping' as the cancel reason — verify every session
    // saw it, so a future caller can grep logs for that string.
    expect(stubs.map(s => s.cancelReasons)).toEqual([['prover-node stopping'], ['prover-node stopping']]);
    // A clean shutdown must preserve the in-flight broker jobs so a restart reuses them.
    expect(stubs.map(s => s.cancelAbortJobs)).toEqual([[false], [false]]);
  });

  it('stop awaits sessions whose cancel is in flight', async () => {
    await openCanonicalFullSession(EpochNumber(3), [proverForCheckpoint(1, 6)]);
    const session = stubs[0];

    // Hold cancel until the test releases the gate. stop() must wait on the in-flight
    // cancel rather than returning early.
    const cancelGate = promiseWithResolvers<void>();
    session.cancelBlocker = cancelGate.promise;

    const stopPromise = manager.stop();
    // Trigger: cancelStarted fires the moment SessionManager.stop invokes session.cancel.
    await session.cancelStarted.promise;
    // Confirm stop is still pending and the cancel hasn't reached completion.
    expect(session.cancelled).toBe(false);
    expect(session.state).toBe('awaiting-checkpoints');

    // Release the gate; stop now returns.
    cancelGate.resolve();
    await stopPromise;
    expect(session.cancelled).toBe(true);
    expect(session.state).toBe('cancelled');
    expect(session.cancelReasons).toEqual(['prover-node stopping']);
  });

  it('rejects further reconcile scheduling once stop has drained the queue', async () => {
    await manager.stop();

    // After stop, reconcileQueue.cancel() has fired — any new enqueue attempt rejects.
    // We assert via onCheckpointAdded, the most common entry point for new reconciles.
    await expect(manager.onCheckpointAdded(EpochNumber(3))).rejects.toThrow(/enqueue/i);
    expect(stubs).toHaveLength(0);
    expect(manager.getFullSession(EpochNumber(3))).toBeUndefined();
  });

  // ---------------- helpers ----------------

  async function openCanonicalFullSession(epoch: EpochNumber, provers: CheckpointProver[]): Promise<void> {
    l2BlockSource.isEpochComplete.mockResolvedValueOnce(true);
    l2BlockSource.getCheckpoints.mockResolvedValueOnce(provers.map(p => ({ checkpoint: p.checkpoint }) as any));
    store.listInSlotRange.mockReturnValueOnce(provers);
    await manager.onCheckpointAdded(epoch);
  }

  /**
   * Arms a single-shot trigger that fires the moment the manager constructs the next stub
   * session. Returns a promise that resolves with that stub. Use this instead of sleeping
   * after an action that schedules a reconcile — the manager itself signals "session ready"
   * via the factory call.
   */
  /** Lets `runSession`'s post-`start()` continuation (failure upload, logging) run after a stub terminates. */
  function flushSessionCompletion(): Promise<void> {
    return new Promise<void>(resolve => setImmediate(resolve));
  }

  function awaitNextStub(): Promise<StubSession> {
    const { promise, resolve } = promiseWithResolvers<StubSession>();
    onConstruct = stub => {
      onConstruct = undefined;
      resolve(stub);
    };
    return promise;
  }

  /**
   * Mocks the chain tip that `nextUnprovenEpoch` reads: proven height = `provenBlock`, with the
   * first unproven block (`provenBlock + 1`) sitting at `firstUnprovenSlot` — or not yet mined
   * when `undefined`. With epochDuration=2, slot N lives in epoch ⌊N/2⌋: e.g. slot 6 → epoch 3.
   */
  function mockNextUnprovenSlot(provenBlock: number, firstUnprovenSlot: number | undefined) {
    l2BlockSource.getBlockNumber.mockResolvedValue(BlockNumber(provenBlock));
    l2BlockSource.getBlockData.mockImplementation((query: any) => {
      if (!('number' in query) || Number(query.number) !== provenBlock + 1 || firstUnprovenSlot === undefined) {
        return Promise.resolve(undefined);
      }
      return Promise.resolve({ header: { getSlot: () => SlotNumber(firstUnprovenSlot) } } as any);
    });
  }
});

/**
 * Subclass that swaps `doConstructSession` for an injected factory so tests can hand
 * back stub sessions whose lifecycle they control.
 */
class TestSessionManager extends SessionManager {
  constructor(
    deps: Omit<SessionManagerDeps, 'bindings'>,
    private readonly factory: (spec: SessionSpec, provers: readonly CheckpointProver[]) => EpochSession,
  ) {
    super(deps);
  }

  protected override constructSession(spec: SessionSpec, provers: readonly CheckpointProver[]): EpochSession {
    return this.factory(spec, provers);
  }
}

/** Minimal EpochSession-shaped stub for SessionManager-level tests. */
type StubSession = {
  spec: SessionSpec;
  provers: readonly CheckpointProver[];
  uuid: string;
  state: EpochProvingJobState;
  cancelled: boolean;
  /** Reasons captured for every cancel(reason) call. Lets assertions verify "why" the cancel fired. */
  cancelReasons: string[];
  /** abortJobs captured for every cancel() call. Lets assertions verify a clean shutdown preserves jobs. */
  cancelAbortJobs: boolean[];
  /** Optional gate held by tests that want to drive a cancel mid-flight. */
  cancelBlocker?: Promise<void>;
  /** Resolves the first time cancel() is invoked — tests use it to know when stop's cancel call lands. */
  cancelStarted: ReturnType<typeof promiseWithResolvers<void>>;
  donePromise: Promise<EpochProvingJobState>;
  resolveDone: (s: EpochProvingJobState) => void;
  terminate(state: EpochProvingJobState): void;
  // EpochSession interface methods used by SessionManager:
  getSpec(): SessionSpec;
  getId(): string;
  getState(): EpochProvingJobState;
  getEpochNumber(): EpochNumber;
  getCheckpoints(): readonly CheckpointProver[];
  isTerminal(): boolean;
  cancel(reason?: string, opts?: { abortJobs?: boolean }): Promise<void>;
  start(): Promise<EpochProvingJobState>;
  whenDone(): Promise<EpochProvingJobState>;
};

let stubCounter = 0;

function makeStubSession(spec: SessionSpec, provers: readonly CheckpointProver[]): StubSession {
  const { promise, resolve } = promiseWithResolvers<EpochProvingJobState>();
  const stub: StubSession = {
    spec,
    provers,
    uuid: `stub-${stubCounter++}`,
    state: 'awaiting-checkpoints',
    cancelled: false,
    cancelReasons: [],
    cancelAbortJobs: [],
    cancelStarted: promiseWithResolvers<void>(),
    donePromise: promise,
    resolveDone: resolve,
    terminate(state) {
      this.state = state;
      this.resolveDone(state);
    },
    getSpec() {
      return this.spec;
    },
    getId() {
      return this.uuid;
    },
    getState() {
      return this.state;
    },
    getEpochNumber() {
      return this.spec.epochNumber;
    },
    getCheckpoints() {
      return this.provers;
    },
    isTerminal() {
      const terminal: EpochProvingJobState[] = [
        'completed',
        'superseded',
        'failed',
        'stopped',
        'cancelled',
        'timed-out',
      ];
      return terminal.includes(this.state);
    },
    async cancel(reason?: string, opts?: { abortJobs?: boolean }) {
      this.cancelReasons.push(reason ?? 'cancelled');
      this.cancelAbortJobs.push(opts?.abortJobs ?? true);
      this.cancelStarted.resolve();
      if (this.cancelBlocker) {
        await this.cancelBlocker;
      }
      this.cancelled = true;
      this.terminate('cancelled');
    },
    start() {
      return this.donePromise;
    },
    whenDone() {
      return this.donePromise;
    },
  };
  return stub;
}

/**
 * Minimal checkpoint content carrying just enough for `CheckpointProver.idFor` (number, slot,
 * archive root). The archive root is derived from (number, slot) so identical (number, slot) pairs
 * produce identical content-addressed ids — letting archiver-side and store-side stubs match.
 */
function makeCheckpointContent(number: number, slot: number) {
  return {
    number,
    header: { slotNumber: SlotNumber(slot) },
    archive: { root: { toString: () => `root-${number}-${slot}` } },
    blocks: [{ number }],
  } as any;
}

function proverForCheckpoint(number: number, slot: number): CheckpointProver {
  const checkpoint = makeCheckpointContent(number, slot);
  return {
    id: CheckpointProver.idFor(checkpoint),
    checkpoint,
    slotNumber: SlotNumber(slot),
    isCancelled: () => false,
  } as unknown as CheckpointProver;
}

/** Archiver-side PublishedCheckpoint stub whose content matches `proverForCheckpoint(number, slot)`. */
function archiverCp(number: number, slot: number) {
  return { checkpoint: makeCheckpointContent(number, slot) } as any;
}

function proverWithSlot(slot: number): CheckpointProver {
  return proverForCheckpoint(1, slot);
}

/** Minimal Histogram/Gauge/Counter stub: only the methods ProverNodeJobMetrics records into. */
function noopMetric() {
  return { record: () => {}, add: () => {} };
}
