import { ARCHIVE_HEIGHT } from '@aztec/constants';
import { makeTuple } from '@aztec/foundation/array';
import { BlockNumber, CheckpointNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { timesAsync } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { L2BlockSource } from '@aztec/stdlib/block';
import { Checkpoint } from '@aztec/stdlib/checkpoint';
import { EmptyL1RollupConstants } from '@aztec/stdlib/epoch-helpers';

import { mock } from 'jest-mock-extended';

import { CheckpointStore } from './checkpoint-store.js';
import type { CheckpointProver } from './job/checkpoint-prover.js';

describe('CheckpointStore', () => {
  let store: CheckpointStore;
  let blockSource: ReturnType<typeof mock<Pick<L2BlockSource, 'getL1Constants'>>>;
  /** Track stub provers we hand back from the factory. */
  const stubs: StubProver[] = [];

  // Single-slot epochs make every checkpoint live in its own epoch and slot range.
  const l1Constants = { ...EmptyL1RollupConstants, epochDuration: 1 };

  beforeEach(() => {
    blockSource = mock<Pick<L2BlockSource, 'getL1Constants'>>();
    blockSource.getL1Constants.mockResolvedValue(l1Constants);
    stubs.length = 0;
    store = new CheckpointStore(
      blockSource,
      // The deps are not exercised — the factory below ignores them.
      {} as any,
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

  it('addOrUpdate reuses the prover for a still-canonical duplicate registration', async () => {
    // An at-least-once re-registration of a checkpoint that has NOT been pruned reuses the running
    // prover rather than rebuilding its in-flight work.
    const cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1 });

    const first = await store.addOrUpdate(cp, makeRegisterData());
    const second = await store.addOrUpdate(cp, makeRegisterData());
    expect(second).toBe(first);
    expect(stubs.length).toBe(1);
  });

  it('addOrUpdate rebuilds a fresh prover for a re-add after prune', async () => {
    const cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1 });

    const first = await store.addOrUpdate(cp, makeRegisterData());
    expect(first.isCancelled()).toBe(false);
    store.cancelAndRemoveAboveBlock(BlockNumber(0));
    // The pruned prover is cancelled and dropped from the store.
    expect(first.isCancelled()).toBe(true);
    expect(store.getByCheckpoint(cp)).toBeUndefined();

    // Re-adding the identical checkpoint (same archive root) constructs a fresh prover — the pruned
    // one's forked world-state reads did not survive, so there is nothing to reuse.
    const second = await store.addOrUpdate(cp, makeRegisterData());
    expect(second).not.toBe(first);
    expect(second.isCancelled()).toBe(false);
    expect(stubs.length).toBe(2);
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
      /a different checkpoint already occupies this slot/i,
    );

    // After the predecessor is pruned (cancelled and removed), the replacement is accepted and keys
    // to a distinct prover (different archive root → different content id).
    store.cancelAndRemoveAboveBlock(BlockNumber(0));
    expect(proverA.isCancelled()).toBe(true);
    const proverB = await store.addOrUpdate(b, makeRegisterData());
    expect(proverB).not.toBe(proverA);
    expect(proverB.isCancelled()).toBe(false);
    expect(stubs.length).toBe(2);
  });

  it('cancelAndRemoveAboveBlock cancels and removes every prover holding a block above the target and returns them', async () => {
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
    const affected = store.cancelAndRemoveAboveBlock(BlockNumber(2));
    expect(affected.map(p => p.checkpoint.number)).toEqual([3, 4]);
    expect(affected.every(p => p.isCancelled())).toBe(true);
    // The orphaned provers are gone from the store; only 1 and 2 remain.
    expect(store.list().map(p => p.checkpoint.number)).toEqual([1, 2]);
  });

  it('cancelAndRemoveAboveBlock removes a checkpoint whose block range straddles the target (partially orphaned)', async () => {
    // A single checkpoint spanning blocks 5..8. A prune to block 6 lands mid-checkpoint: the checkpoint is partially
    // orphaned (blocks 7, 8 are gone) and must be removed, since its last block (8) is above the target.
    const cp = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 4, startBlockNumber: 5 });
    await store.addOrUpdate(cp, makeRegisterData());

    const affected = store.cancelAndRemoveAboveBlock(BlockNumber(6));
    expect(affected.map(p => p.checkpoint.number)).toEqual([1]);
    expect(affected[0].isCancelled()).toBe(true);
    expect(store.list()).toEqual([]);
  });

  it('reapExpired drops provers whose epoch is ≤ expiredEpoch', async () => {
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

  it('listForEpoch returns only provers in the epoch slot range', async () => {
    // With epochDuration=1, each epoch's slot range is exactly [slot, slot].
    const cp1 = await Checkpoint.random(CheckpointNumber(1), { numBlocks: 1, slotNumber: SlotNumber(10) });
    const cp2 = await Checkpoint.random(CheckpointNumber(2), { numBlocks: 1, slotNumber: SlotNumber(11) });
    await store.addOrUpdate(cp1, makeRegisterData());
    await store.addOrUpdate(cp2, makeRegisterData());

    const epoch10 = await store.listForEpoch(EpochNumber(10));
    const epoch11 = await store.listForEpoch(EpochNumber(11));
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
  cancelled: boolean;
  isCancelled(): boolean;
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
    cancelled: false,
    isCancelled() {
      return this.cancelled;
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
    previousInboxRollingHash: Fr.ZERO,
    previousArchiveSiblingPath: makeTuple(ARCHIVE_HEIGHT, () => Fr.ZERO),
  };
}
