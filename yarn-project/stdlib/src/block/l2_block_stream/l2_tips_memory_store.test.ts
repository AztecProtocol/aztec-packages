import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';

import type { PublishedCheckpoint } from '../../checkpoint/published_checkpoint.js';
import { BlockHash } from '../block_hash.js';
import type { L2BlockId } from '../l2_block_source.js';
import { L2TipsMemoryStore } from './l2_tips_memory_store.js';

const makeHash = (n: number) => new Fr(n).toString();
const makeBlockId = (n: number): L2BlockId => ({ number: BlockNumber(n), hash: makeHash(n) });
const makeCheckpoint = (blockNumber: number, checkpointNumber: number) =>
  ({
    checkpoint: {
      number: CheckpointNumber(checkpointNumber),
      hash: () => new Fr(checkpointNumber),
      blocks: [{ number: BlockNumber(blockNumber) }],
    },
  }) as unknown as PublishedCheckpoint;

describe('L2TipsMemoryStore clamping', () => {
  let store: L2TipsMemoryStore;

  beforeEach(() => {
    store = new L2TipsMemoryStore(new BlockHash(new Fr(0)));
  });

  it('returns genesis tips when store is empty', async () => {
    const tips = await store.getL2Tips();
    expect(tips.proposed.number).toBe(0);
    expect(tips.proven.block.number).toBe(0);
    expect(tips.finalized.block.number).toBe(0);
    expect(tips.checkpointed.block.number).toBe(0);
    expect(tips.proposedCheckpoint.block.number).toBe(0);
  });

  it('clamps proven to proposed when chain-proven advances past local block data', async () => {
    // Simulate: local store has proposed=3, but receives a chain-proven event for block 5
    // (which hasn't been downloaded yet). getL2Tips() should clamp without throwing.
    await store.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: [
        { number: BlockNumber(1), hash: () => Promise.resolve(new BlockHash(new Fr(1))) },
        { number: BlockNumber(2), hash: () => Promise.resolve(new BlockHash(new Fr(2))) },
        { number: BlockNumber(3), hash: () => Promise.resolve(new BlockHash(new Fr(3))) },
      ] as any,
    });

    // Directly write a proven tip higher than what's in the block store.
    // This simulates the L1-derived proven advancing before block-data sync.
    await store.handleBlockStreamEvent({
      type: 'chain-proven',
      block: makeBlockId(5),
    });

    // getL2Tips() must not throw and proven must be clamped to proposed.
    const tips = await store.getL2Tips();
    expect(tips.proposed.number).toBe(3);
    expect(tips.proven.block.number).toBeLessThanOrEqual(tips.proposed.number);
  });

  it('satisfies ordering invariant after checkpoint and proven events', async () => {
    // Add blocks 1-3 and checkpoint them.
    await store.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: [
        { number: BlockNumber(1), hash: () => Promise.resolve(new BlockHash(new Fr(1))) },
        { number: BlockNumber(2), hash: () => Promise.resolve(new BlockHash(new Fr(2))) },
        { number: BlockNumber(3), hash: () => Promise.resolve(new BlockHash(new Fr(3))) },
      ] as any,
    });

    await store.handleBlockStreamEvent({
      type: 'chain-checkpointed',
      block: makeBlockId(3),
      checkpoint: makeCheckpoint(3, 1),
    });

    await store.handleBlockStreamEvent({
      type: 'chain-proven',
      block: makeBlockId(3),
    });

    const tips = await store.getL2Tips();
    expect(tips.finalized.block.number).toBeLessThanOrEqual(tips.proven.block.number);
    expect(tips.proven.block.number).toBeLessThanOrEqual(tips.checkpointed.block.number);
    expect(tips.checkpointed.block.number).toBeLessThanOrEqual(tips.proposedCheckpoint.block.number);
    expect(tips.proposedCheckpoint.block.number).toBeLessThanOrEqual(tips.proposed.number);
  });

  it('does not prune block hashes or checkpoints still referenced by a tip behind finalized', async () => {
    // Seed: blocks 1-3 added, checkpoint 1 at block 3 known, proven and checkpointed both at 3.
    await store.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: [
        { number: BlockNumber(1), hash: () => Promise.resolve(new BlockHash(new Fr(1))) },
        { number: BlockNumber(2), hash: () => Promise.resolve(new BlockHash(new Fr(2))) },
        { number: BlockNumber(3), hash: () => Promise.resolve(new BlockHash(new Fr(3))) },
      ] as any,
    });
    await store.handleBlockStreamEvent({
      type: 'chain-checkpointed',
      block: makeBlockId(3),
      checkpoint: makeCheckpoint(3, 1),
    });
    await store.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(3) });

    // Finalize advances ahead of the existing proven/checkpointed tips (transient ordering).
    await store.handleBlockStreamEvent({ type: 'chain-finalized', block: makeBlockId(5) });

    // getL2Tips must not throw: proven/checkpointed at block 3 still need their block hash
    // *and* their enclosing checkpoint (1) preserved despite the finalized prune.
    const tips = await store.getL2Tips();
    expect(tips.finalized.block.number).toBeLessThanOrEqual(tips.proven.block.number);
    expect(tips.proven.block.number).toBeLessThanOrEqual(tips.checkpointed.block.number);
  });
});
