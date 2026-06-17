import { ARCHIVE_HEIGHT } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';

import { mock } from 'jest-mock-extended';

import { type CheckpointProverFactory, CheckpointStore } from './checkpoint-store.js';
import type { CheckpointProver } from './job/checkpoint-prover.js';

describe('CheckpointStore', () => {
  let store: TestCheckpointStore;
  let blockSource: ReturnType<typeof mock<Pick<L2BlockSource, 'getSyncedL2SlotNumber' | 'getL1Constants'>>>;
  /** Track stub provers we hand back from the factory. */
  const stubs: StubProver[] = [];

  // Single-slot epochs make every checkpoint live in its own epoch and slot range.
  const l1Constants = { ...EmptyL1RollupConstants, epochDuration: 1 };

  beforeEach(() => {
    blockSource = mock<Pick<L2BlockSource, 'getSyncedL2SlotNumber' | 'getL1Constants'>>();
    blockSource.getL1Constants.mockResolvedValue(l1Constants);
    stubs.length = 0;
    store = new TestCheckpointStore(
      blockSource,
      // The deps are not exercised — the factory below ignores them.
      {} as any,
      { slotWatcherPollIntervalMs: 100 },
      undefined,
      (args, _deps) => {
        const stub = makeStubProver(args.checkpoint, args.epochNumber);
        stubs.push(stub);
        return stub as unknown as CheckpointProver;
      },
    );
  });

  afterEach(async () => {
    await store.stop();
  });

  it('addOrUpdate creates a new prover for a fresh content key', async () => {
    const cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1 });

    const prover = await store.addOrUpdate(cp, makeRegisterData());
    expect(prover.checkpoint).toBe(cp);
    expect(stubs.length).toBe(1);
  });

  it('addOrUpdate is idempotent for the same content key (re-add after prune)', async () => {
    const cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1 });

    const first = await store.addOrUpdate(cp, makeRegisterData());
    expect(first.isPruned()).toBe(false);
    store.markPrunedAboveBlock(BlockNumber(0));
    expect(first.isPruned()).toBe(true);

    // Re-adding the identical checkpoint (same archive root) reuses the existing prover.
    const second = await store.addOrUpdate(cp, makeRegisterData());
    expect(second).toBe(first);
    expect(second.isPruned()).toBe(false);
    expect(stubs.length).toBe(1);
  });

  it('addOrUpdate refuses a conflicting canonical checkpoint at the same slot', async () => {
    // Two canonical checkpoints sharing a slot would be a parallel chain. The store rejects
    // the second; the caller must prune the first (via the chain-pruned event) before the
    // replacement built on the same predecessor after a reorg can be added.
    const a = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: SlotNumber(5) });
    const b = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: SlotNumber(5) });
    expect(a.archive.root.equals(b.archive.root)).toBe(false);

    const proverA = await store.addOrUpdate(a, makeRegisterData());
    await expect(store.addOrUpdate(b, makeRegisterData())).rejects.toThrow(
      /canonical checkpoint already occupies this slot/i,
    );

    // After the predecessor is pruned, the replacement is accepted and keys to a distinct
    // prover (different archive root → different content id).
    store.markPrunedAboveBlock(BlockNumber(0));
    expect(proverA.isPruned()).toBe(true);
    const proverB = await store.addOrUpdate(b, makeRegisterData());
    expect(proverB).not.toBe(proverA);
    expect(proverB.isPruned()).toBe(false);
    expect(stubs.length).toBe(2);
  });

  it('markPrunedAboveBlock marks every prover holding a block above the target and returns them', async () => {
    // Four single-block checkpoints occupying blocks 1..4 (one block each). Pruning to block 2 orphans the
    // checkpoints whose last block is above 2 — checkpoints 3 and 4 — and leaves 1 and 2 canonical.
    const cps = await timesAsync(4, i =>
      Checkpoint.random(CheckpointNumber(i + 1), {
        numBlocks: 1,
        startBlockNumber: i + 1,
        slotNumber: SlotNumber(i + 1),
      }),
    );
    for (const cp of cps) {
      await store.addOrUpdate(cp, makeRegisterData());
    }
    const affected = store.markPrunedAboveBlock(BlockNumber(2));
    expect(affected.map(p => p.checkpoint.number)).toEqual([3, 4]);
    expect(store.listCanonical().map(p => p.checkpoint.number)).toEqual([1, 2]);
  });

  it('markPrunedAboveBlock marks a checkpoint whose block range straddles the target (partially orphaned)', async () => {
    // A single checkpoint spanning blocks 5..8. A prune to block 6 lands mid-checkpoint: the checkpoint is partially
    // orphaned (blocks 7, 8 are gone) and must be marked, since its last block (8) is above the target.
    const cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 4, startBlockNumber: 5 });
    await store.addOrUpdate(cp, makeRegisterData());

    const affected = store.markPrunedAboveBlock(BlockNumber(6));
    expect(affected.map(p => p.checkpoint.number)).toEqual([1]);
    expect(store.listCanonical()).toEqual([]);
  });

  it('reapExpired drops canonical provers whose epoch is ≤ expiredEpoch', async () => {
    // With epochDuration=1 each checkpoint's slot is also its epoch number.
    const cps = await Promise.all([
      Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: SlotNumber(1) }),
      Checkpoint.random(CheckpointNumber(2), { numBlocks: 1, slotNumber: SlotNumber(2) }),
      Checkpoint.random(CheckpointNumber(3), { numBlocks: 1, slotNumber: SlotNumber(3) }),
    ]);
    for (const cp of cps) {
      await store.addOrUpdate(cp, makeRegisterData());
    }
    store.reapExpired(EpochNumber(2));
    const remainingNumbers = store.listAll().map(p => p.checkpoint.number);
    expect(remainingNumbers).toEqual([3]);
  });

  it('reapExpired leaves pruned provers in place', async () => {
    const cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: SlotNumber(1) });
    await store.addOrUpdate(cp, makeRegisterData());
    store.markPrunedAboveBlock(BlockNumber(0));
    store.reapExpired(EpochNumber(10));
    expect(store.listAll().map(p => p.checkpoint.number)).toEqual([1]);
  });

  // ---------------- slot watcher ----------------

  it('slot watcher reaps pruned provers whose slot is strictly before the synced slot', async () => {
    const cp1 = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: SlotNumber(1) });
    const cp2 = await Checkpoint.random(CheckpointNumber(2), { numBlocks: 1, slotNumber: SlotNumber(2) });
    const cp3 = await Checkpoint.random(CheckpointNumber(3), { numBlocks: 1, slotNumber: SlotNumber(3) });
    for (const cp of [cp1, cp2, cp3]) {
      await store.addOrUpdate(cp, makeRegisterData());
    }
    // Prune everything above checkpoint 0 ⇒ all three flip to pruned.
    store.markPrunedAboveBlock(BlockNumber(0));
    blockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(3));

    await store.triggerSlotWatcherTick();

    // Slots 1 and 2 are < 3 and get reaped; slot 3 is not strictly less, so it stays.
    expect(store.listAll().map(p => p.checkpoint.number)).toEqual([3]);
    // Reaped stubs were cancelled by the watcher.
    expect(stubs.find(s => s.checkpoint.number === 1)!.cancelled).toBe(true);
    expect(stubs.find(s => s.checkpoint.number === 2)!.cancelled).toBe(true);
    expect(stubs.find(s => s.checkpoint.number === 3)!.cancelled).toBe(false);
  });

  it('slot watcher leaves canonical provers in place even when their slot is past the synced slot', async () => {
    // Canonical provers must survive — only pruned provers are eligible for reaping.
    const cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: SlotNumber(1) });
    await store.addOrUpdate(cp, makeRegisterData());
    blockSource.getSyncedL2SlotNumber.mockResolvedValue(SlotNumber(10));

    await store.triggerSlotWatcherTick();

    expect(store.listAll().map(p => p.checkpoint.number)).toEqual([1]);
    expect(stubs[0].cancelled).toBe(false);
  });

  it('slot watcher no-ops when getSyncedL2SlotNumber returns undefined', async () => {
    const cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: SlotNumber(1) });
    await store.addOrUpdate(cp, makeRegisterData());
    store.markPrunedAboveBlock(BlockNumber(0));
    blockSource.getSyncedL2SlotNumber.mockResolvedValue(undefined);

    await store.triggerSlotWatcherTick();

    // No synced slot yet ⇒ watcher doesn't know whether the chain has moved past, so it
    // keeps the pruned prover around for a possible re-add.
    expect(store.listAll().map(p => p.checkpoint.number)).toEqual([1]);
    expect(stubs[0].cancelled).toBe(false);
  });

  it('slot watcher swallows getSyncedL2SlotNumber errors instead of crashing the tick', async () => {
    const cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: SlotNumber(1) });
    await store.addOrUpdate(cp, makeRegisterData());
    store.markPrunedAboveBlock(BlockNumber(0));
    blockSource.getSyncedL2SlotNumber.mockRejectedValue(new Error('archiver unavailable'));

    await expect(store.triggerSlotWatcherTick()).resolves.toBeUndefined();
    expect(store.listAll().map(p => p.checkpoint.number)).toEqual([1]);
  });

  it('listCanonicalForEpoch returns only canonical provers in the epoch slot range', async () => {
    // With epochDuration=1, each epoch's slot range is exactly [slot, slot].
    const cp1 = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: SlotNumber(10) });
    const cp2 = await Checkpoint.random(CheckpointNumber(2), { numBlocks: 1, slotNumber: SlotNumber(11) });
    await store.addOrUpdate(cp1, makeRegisterData());
    await store.addOrUpdate(cp2, makeRegisterData());

    const epoch10 = await store.listCanonicalForEpoch(EpochNumber(10));
    const epoch11 = await store.listCanonicalForEpoch(EpochNumber(11));
    expect(epoch10.map(p => p.checkpoint.number)).toEqual([1]);
    expect(epoch11.map(p => p.checkpoint.number)).toEqual([2]);
  });
});

/** Minimal CheckpointProver-shaped stub for store-level tests. */
type StubProver = {
  id: string;
  checkpoint: Checkpoint;
  slotNumber: SlotNumber;
  epochNumber: EpochNumber;
  pruned: boolean;
  cancelled: boolean;
  isPruned(): boolean;
  isCancelled(): boolean;
  markPruned(): void;
  markCanonical(): void;
  cancel(opts?: { routine?: boolean }): void;
  whenDone(): Promise<void>;
};

function makeStubProver(checkpoint: Checkpoint, epochNumber: EpochNumber): StubProver {
  const id = `${checkpoint.number}:${checkpoint.header.slotNumber}:${checkpoint.archive.root.toString()}`;
  return {
    id,
    checkpoint,
    slotNumber: checkpoint.header.slotNumber,
    epochNumber,
    pruned: false,
    cancelled: false,
    isPruned() {
      return this.pruned;
    },
    isCancelled() {
      return this.cancelled;
    },
    markPruned() {
      this.pruned = true;
    },
    markCanonical() {
      this.pruned = false;
    },
    cancel() {
      this.cancelled = true;
    },
    whenDone() {
      return Promise.resolve();
    },
  };
}

function makeRegisterData() {
  return {
    attestations: [],
    previousBlockHeader: {} as any,
    l1ToL2Messages: [],
    previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
  };
}

/**
 * Subclass that exposes the protected `reapPrunedPastSlot` so tests can drive a single
 * SlotWatcher tick directly — avoids spinning up the underlying `RunningPromise` and
 * waiting on its polling interval.
 */
class TestCheckpointStore extends CheckpointStore {
  constructor(
    blockSource: ConstructorParameters<typeof CheckpointStore>[0],
    proverDeps: ConstructorParameters<typeof CheckpointStore>[1],
    options: ConstructorParameters<typeof CheckpointStore>[2],
    bindings: ConstructorParameters<typeof CheckpointStore>[3],
    factory: CheckpointProverFactory,
  ) {
    super(blockSource, proverDeps, options, bindings, factory);
  }

  public triggerSlotWatcherTick(): Promise<void> {
    return this.reapPrunedPastSlot();
  }
}
