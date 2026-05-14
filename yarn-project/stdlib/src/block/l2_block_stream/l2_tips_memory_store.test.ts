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

describe('L2TipsMemoryStore', () => {
  let store: L2TipsMemoryStore;

  beforeEach(() => {
    store = new L2TipsMemoryStore(new BlockHash(new Fr(0)));
  });

  const addBlocks = (...numbers: number[]) =>
    store.handleBlockStreamEvent({
      type: 'blocks-added',
      blocks: numbers.map(n => ({
        number: BlockNumber(n),
        hash: () => Promise.resolve(new BlockHash(new Fr(n))),
      })) as any,
    });

  it('returns genesis tips when store is empty', async () => {
    const tips = await store.getL2Tips();
    expect(tips.proposed.number).toBe(0);
    expect(tips.proven.block.number).toBe(0);
    expect(tips.finalized.block.number).toBe(0);
    expect(tips.checkpointed.block.number).toBe(0);
    expect(tips.proposedCheckpoint.block.number).toBe(0);
  });

  it('clamps proven to checkpointed when chain-proven runs ahead of chain-checkpointed', async () => {
    // The cross-tier cascade ensures `proven ≤ checkpointed` even when the block stream emits
    // chain-proven before chain-checkpointed catches up for the same block. The L2BlockStream's
    // startingBlock-skip path is responsible for reconciling local.checkpointed first; this
    // clamp guards against any remaining transient inconsistency.
    await addBlocks(1, 2, 3);
    await store.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(3) });

    const tips = await store.getL2Tips();
    expect(tips.proposed.number).toBe(3);
    expect(tips.checkpointed.block.number).toBe(0);
    expect(tips.proven.block.number).toBe(0);
  });

  it('clamps proven to proposed when chain-proven advances past local block data', async () => {
    await addBlocks(1, 2, 3);
    await store.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(5) });

    const tips = await store.getL2Tips();
    expect(tips.proposed.number).toBe(3);
    expect(tips.proven.block.number).toBeLessThanOrEqual(3);
  });

  it('does not prune block hashes or checkpoints still referenced by a tip behind finalized', async () => {
    // Seed: blocks 1-3 added, checkpoint 1 at block 3, proven and checkpointed both at 3.
    await addBlocks(1, 2, 3);
    await store.handleBlockStreamEvent({
      type: 'chain-checkpointed',
      block: makeBlockId(3),
      checkpoint: makeCheckpoint(3, 1),
    });
    await store.handleBlockStreamEvent({ type: 'chain-proven', block: makeBlockId(3) });

    // Finalize advances ahead of the existing proven/checkpointed tips (transient ordering).
    await store.handleBlockStreamEvent({ type: 'chain-finalized', block: makeBlockId(5) });

    // Despite the finalized prune, block 3's hash and checkpoint 1 must remain reachable —
    // proven/checkpointed still point at them. Without the delete guard, getL2Tips would throw.
    const tips = await store.getL2Tips();
    expect(tips.proven.block.number).toBe(3);
    expect(tips.checkpointed.block.number).toBe(3);
    expect(tips.checkpointed.checkpoint.number).toBe(1);
  });
});
