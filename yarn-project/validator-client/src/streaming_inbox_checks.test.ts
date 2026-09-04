import { Fr } from '@aztec/foundation/curves/bn254';
import { promiseWithResolvers } from '@aztec/foundation/promise';
import { InboxBucketRef } from '@aztec/stdlib/messaging';

import { describe, expect, it } from '@jest/globals';

import {
  type StreamingBlockCheckInput,
  type StreamingInboxMessageSource,
  checkStreamingBlockProposal,
  readStreamingBlockBundle,
} from './streaming_inbox_checks.js';

const PER_BLOCK_CAP = 1024;
const PER_CHECKPOINT_CAP = 1024;

/**
 * In-memory Inbox view mirroring the archiver store's count-addressed semantics: a flat leaf log indexed by global
 * message index, and a prefix rolling hash per count. Prefix hashes are kept apart from any bucket partition, exactly
 * as the store keeps them apart from its bucket snapshots, so a test can move boundaries without touching either.
 */
class FakeInboxView implements StreamingInboxMessageSource {
  private readonly leaves: Fr[] = [];
  private readonly rollingHashByCount = new Map<bigint, Fr>();

  /**
   * Appends `msgCount` leaves and registers the prefix hash at the resulting count. Returns the count and the hash,
   * which together are what a block proposal signs.
   */
  addMessages(msgCount: number, rollingHash?: Fr): { totalMsgCount: bigint; inboxRollingHash: Fr } {
    const priorTotal = this.leaves.length;
    for (let i = 0; i < msgCount; i++) {
      this.leaves.push(new Fr(1000 + priorTotal + i));
    }
    const totalMsgCount = BigInt(this.leaves.length);
    const inboxRollingHash = rollingHash ?? new Fr(500_000 + this.leaves.length);
    this.rollingHashByCount.set(totalMsgCount, inboxRollingHash);
    return { totalMsgCount, inboxRollingHash };
  }

  /** The prefix hash at a count, as the store would return it. */
  prefixAt(totalMsgCount: bigint): Fr {
    const hash = totalMsgCount === 0n ? Fr.ZERO : this.rollingHashByCount.get(totalMsgCount);
    if (hash === undefined) {
      throw new Error(`Test view has no prefix hash at count ${totalMsgCount}`);
    }
    return hash;
  }

  /** Drops the prefix hash at a count, standing in for a node that has not synced that far. */
  forgetPrefixAt(totalMsgCount: bigint): void {
    this.rollingHashByCount.delete(totalMsgCount);
  }

  /**
   * Replaces the leaf at `index` and every prefix hash from there on, standing in for a content-changing canonical
   * message replacement. Leaves the counts alone, so only the hashes move.
   */
  replaceLeafFrom(index: number): void {
    this.leaves[index] = new Fr(90_000 + index);
    for (let count = index + 1; count <= this.leaves.length; count++) {
      this.rollingHashByCount.set(BigInt(count), new Fr(70_000 + count));
    }
  }

  /** Drops every leaf from `index` on, standing in for a replacement that shortened the canonical chain. */
  truncateLeavesFrom(index: number): void {
    this.leaves.length = index;
  }

  /**
   * Runs `onceRead` immediately after the next range read resolves, so a test can land a replacement in the exact
   * window between reading the leaves and re-confirming the prefix. Deterministic: no timers, no sleeps.
   */
  runAfterNextRangeRead(onceRead: () => void): void {
    this.afterNextRangeRead = onceRead;
  }
  private afterNextRangeRead: (() => void) | undefined;

  getInboxRollingHashAt(totalMsgCount: bigint): Promise<Fr | undefined> {
    return Promise.resolve(totalMsgCount === 0n ? Fr.ZERO : this.rollingHashByCount.get(totalMsgCount));
  }

  getL1ToL2MessagesBetweenLeafCounts(startLeafCount: bigint, endLeafCount: bigint): Promise<Fr[]> {
    if (startLeafCount > endLeafCount || endLeafCount > BigInt(this.leaves.length)) {
      return Promise.reject(new Error(`Invalid Inbox leaf count range [${startLeafCount}, ${endLeafCount})`));
    }
    const leaves = this.leaves.slice(Number(startLeafCount), Number(endLeafCount));
    const after = this.afterNextRangeRead;
    this.afterNextRangeRead = undefined;
    after?.();
    return Promise.resolve(leaves);
  }
}

function baseInput(overrides: Partial<StreamingBlockCheckInput>): StreamingBlockCheckInput {
  return {
    messageSource: new FakeInboxView(),
    bucketRef: undefined,
    endTotalMsgCount: 0n,
    parentTotalMsgCount: 0n,
    checkpointStartTotalMsgCount: 0n,
    perBlockCap: PER_BLOCK_CAP,
    perCheckpointCap: PER_CHECKPOINT_CAP,
    ...overrides,
  };
}

describe('checkStreamingBlockProposal', () => {
  describe('check 1: the proposal carries a prefix reference', () => {
    it('rejects a proposal with no prefix reference', async () => {
      const result = await checkStreamingBlockProposal(baseInput({ bucketRef: undefined }));
      expect(result).toEqual({ accepted: false, reason: 'prefix_unavailable' });
    });
  });

  describe('check 2: consumption moves forward', () => {
    it('rejects when the end count is behind the parent block', async () => {
      const view = new FakeInboxView();
      const prefix = view.addMessages(3);
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(prefix.inboxRollingHash),
          endTotalMsgCount: 3n,
          parentTotalMsgCount: 5n,
        }),
      );
      expect(result).toEqual({ accepted: false, reason: 'consumption_moves_backwards' });
    });
  });

  describe('check 3: caps', () => {
    it('accepts a block consuming exactly the per-block cap', async () => {
      const view = new FakeInboxView();
      const prefix = view.addMessages(PER_BLOCK_CAP);
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(prefix.inboxRollingHash),
          endTotalMsgCount: prefix.totalMsgCount,
          perBlockCap: PER_BLOCK_CAP,
        }),
      );
      expect(result.accepted).toBe(true);
    });

    it('rejects a block consuming one over the per-block cap', async () => {
      const view = new FakeInboxView();
      const prefix = view.addMessages(4);
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(prefix.inboxRollingHash),
          endTotalMsgCount: 4n,
          perBlockCap: 3,
        }),
      );
      expect(result).toEqual({ accepted: false, reason: 'bundle_over_block_cap' });
    });

    it('rejects when the running checkpoint total exceeds the per-checkpoint cap', async () => {
      const view = new FakeInboxView();
      view.addMessages(3); // the checkpoint's earlier consumption, total 3
      const prefix = view.addMessages(3); // total 6
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(prefix.inboxRollingHash),
          endTotalMsgCount: 6n,
          parentTotalMsgCount: 3n,
          checkpointStartTotalMsgCount: 0n,
          perCheckpointCap: 5, // 6 - 0 = 6 > 5
        }),
      );
      expect(result).toEqual({ accepted: false, reason: 'checkpoint_over_msg_cap' });
    });

    it('measures the caps from the signed header count, not from a bucket', async () => {
      // Both caps are computed before any lookup, so an over-cap proposal is rejected without touching the store.
      const view = new FakeInboxView();
      view.addMessages(8);
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(new Fr(1)),
          endTotalMsgCount: 8n,
          parentTotalMsgCount: 0n,
          perBlockCap: 4,
        }),
      );
      expect(result).toEqual({ accepted: false, reason: 'bundle_over_block_cap' });
    });
  });

  describe('check 4: the prefix hash at the signed end count', () => {
    it('accepts an end count that is a current bucket boundary', async () => {
      const view = new FakeInboxView();
      const prefix = view.addMessages(3);
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(prefix.inboxRollingHash),
          endTotalMsgCount: prefix.totalMsgCount,
        }),
      );
      expect(result).toEqual({ accepted: true, bundle: [new Fr(1000), new Fr(1001), new Fr(1002)] });
    });

    it('accepts an end count that a pure repartition left interior to a current bucket', async () => {
      // The signed reference names the prefix at count 2, which was a boundary when the block was built. A reorg then
      // re-mined the same three messages as one bucket, so nothing ends at 2 any more — but every leaf and every
      // prefix hash is unchanged, so the block is exactly as valid as when it was signed.
      const view = new FakeInboxView();
      const interior = view.addMessages(2);
      view.addMessages(1);
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(interior.inboxRollingHash),
          endTotalMsgCount: interior.totalMsgCount,
        }),
      );
      expect(result).toEqual({ accepted: true, bundle: [new Fr(1000), new Fr(1001)] });
    });

    it('accepts a following block whose parent count is interior', async () => {
      // Block N ended at the now-interior count 2; block N+1 consumes the suffix through count 3.
      const view = new FakeInboxView();
      view.addMessages(2);
      const end = view.addMessages(1);
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(end.inboxRollingHash),
          endTotalMsgCount: 3n,
          parentTotalMsgCount: 2n,
        }),
      );
      expect(result).toEqual({ accepted: true, bundle: [new Fr(1002)] });
    });

    it('reports a mismatch when the canonical prefix at that count is a different hash', async () => {
      const view = new FakeInboxView();
      const prefix = view.addMessages(3);
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(new Fr(999)),
          endTotalMsgCount: prefix.totalMsgCount,
        }),
      );
      expect(result).toEqual({ accepted: false, reason: 'prefix_mismatch' });
    });

    it('reports unavailable when nothing is synced at that count', async () => {
      const view = new FakeInboxView();
      const prefix = view.addMessages(3);
      view.forgetPrefixAt(prefix.totalMsgCount);
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(prefix.inboxRollingHash),
          endTotalMsgCount: prefix.totalMsgCount,
        }),
      );
      expect(result).toEqual({ accepted: false, reason: 'prefix_unavailable' });
    });

    it('rejects promptly, without waiting, on either prefix outcome', async () => {
      // The bounded catch-up wait lives in the proposal handler; these checks are point lookups and must not sleep.
      const view = new FakeInboxView();
      const start = Date.now();
      const result = await checkStreamingBlockProposal(
        baseInput({ messageSource: view, bucketRef: new InboxBucketRef(new Fr(1)), endTotalMsgCount: 1n }),
      );
      expect(result).toEqual({ accepted: false, reason: 'prefix_unavailable' });
      expect(Date.now() - start).toBeLessThan(500);
    });
  });

  describe('empty blocks', () => {
    it('checks the prefix at an unchanged count instead of skipping the hash', async () => {
      const view = new FakeInboxView();
      const prefix = view.addMessages(3);
      const accepted = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(prefix.inboxRollingHash),
          endTotalMsgCount: 3n,
          parentTotalMsgCount: 3n,
        }),
      );
      expect(accepted).toEqual({ accepted: true, bundle: [] });

      const rejected = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(new Fr(999)),
          endTotalMsgCount: 3n,
          parentTotalMsgCount: 3n,
        }),
      );
      expect(rejected).toEqual({ accepted: false, reason: 'prefix_mismatch' });
    });

    it('accepts a genesis empty block whose reference is the zero hash', async () => {
      const result = await checkStreamingBlockProposal(
        baseInput({ bucketRef: new InboxBucketRef(Fr.ZERO), endTotalMsgCount: 0n, parentTotalMsgCount: 0n }),
      );
      expect(result).toEqual({ accepted: true, bundle: [] });
    });

    it('rejects a genesis empty block whose reference is not the zero hash', async () => {
      const result = await checkStreamingBlockProposal(
        baseInput({ bucketRef: new InboxBucketRef(new Fr(7)), endTotalMsgCount: 0n, parentTotalMsgCount: 0n }),
      );
      expect(result).toEqual({ accepted: false, reason: 'prefix_mismatch' });
    });
  });

  // The metadata check is a point lookup; a content-changing message replacement can commit between it and the
  // bundle read. `readStreamingBlockBundle` reads the leaves first and re-confirms the prefix afterwards, so the
  // pair always comes from one stable view. Without that, the caller would either re-execute against leaves the
  // proposer never saw — reporting a slashable state mismatch for an honest proposal — or see the range throw.
  describe('bundle read re-confirms the prefix after reading', () => {
    it('rejects when a replacement lands between the point check and the read', async () => {
      const view = new FakeInboxView();
      view.addMessages(2);
      const end = view.addMessages(1);

      // The metadata check passes against the pre-replacement view.
      const metadata = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(end.inboxRollingHash),
          endTotalMsgCount: 3n,
          parentTotalMsgCount: 2n,
        }),
      );
      expect(metadata.accepted).toBe(true);

      // Now the replacement commits, then the bundle is read: the leaves changed under the same counts.
      view.replaceLeafFrom(2);
      const result = await readStreamingBlockBundle(view, {
        parentTotalMsgCount: 2n,
        endTotalMsgCount: 3n,
        bucketRef: new InboxBucketRef(end.inboxRollingHash),
      });

      expect(result).toEqual({ accepted: false, reason: 'prefix_mismatch' });
    });

    it('rejects when a replacement lands in the window between the read and the confirmation', async () => {
      const view = new FakeInboxView();
      view.addMessages(2);
      const end = view.addMessages(1);
      // The replacement commits the instant the leaves have been read, which is the narrowest window there is.
      view.runAfterNextRangeRead(() => view.replaceLeafFrom(2));

      const result = await readStreamingBlockBundle(view, {
        parentTotalMsgCount: 2n,
        endTotalMsgCount: 3n,
        bucketRef: new InboxBucketRef(end.inboxRollingHash),
      });

      expect(result).toEqual({ accepted: false, reason: 'prefix_mismatch' });
    });

    it('reports a range it cannot serve whole as prefix_unavailable rather than throwing', async () => {
      const view = new FakeInboxView();
      view.addMessages(2);
      const end = view.addMessages(1);
      // A replacement dropped the suffix, so the range the proposal names no longer exists.
      view.truncateLeavesFrom(2);

      const result = await readStreamingBlockBundle(view, {
        parentTotalMsgCount: 2n,
        endTotalMsgCount: 3n,
        bucketRef: new InboxBucketRef(end.inboxRollingHash),
      });

      expect(result).toEqual({ accepted: false, reason: 'prefix_unavailable' });
    });

    it('reports prefix_unavailable when the prefix hash is gone even though the range still reads', async () => {
      const view = new FakeInboxView();
      view.addMessages(2);
      const end = view.addMessages(1);
      view.runAfterNextRangeRead(() => view.forgetPrefixAt(3n));

      const result = await readStreamingBlockBundle(view, {
        parentTotalMsgCount: 2n,
        endTotalMsgCount: 3n,
        bucketRef: new InboxBucketRef(end.inboxRollingHash),
      });

      expect(result).toEqual({ accepted: false, reason: 'prefix_unavailable' });
    });

    it('returns the leaves it confirmed when nothing moved', async () => {
      const view = new FakeInboxView();
      view.addMessages(2);
      const end = view.addMessages(1);

      const result = await readStreamingBlockBundle(view, {
        parentTotalMsgCount: 2n,
        endTotalMsgCount: 3n,
        bucketRef: new InboxBucketRef(end.inboxRollingHash),
      });

      expect(result).toEqual({ accepted: true, bundle: [new Fr(1002)] });
    });

    it('confirms an empty range without reading messages', async () => {
      const view = new FakeInboxView();
      const end = view.addMessages(2);
      // An empty bundle still has to name the signed prefix, so the confirmation runs even with nothing to read.
      view.runAfterNextRangeRead(() => {
        throw new Error('an empty range must not be read');
      });

      const result = await readStreamingBlockBundle(view, {
        parentTotalMsgCount: 2n,
        endTotalMsgCount: 2n,
        bucketRef: new InboxBucketRef(end.inboxRollingHash),
      });

      expect(result).toEqual({ accepted: true, bundle: [] });
    });

    it('does not resolve before the read completes, so a caller cannot observe a torn pair', async () => {
      // Pins the ordering: the confirmation is awaited after the read, so there is no interleaving in which a
      // caller receives leaves whose prefix has not been re-confirmed.
      const view = new FakeInboxView();
      view.addMessages(2);
      const end = view.addMessages(1);
      const gate = promiseWithResolvers<void>();
      const order: string[] = [];
      view.runAfterNextRangeRead(() => order.push('read'));

      const pending = readStreamingBlockBundle(
        {
          getInboxRollingHashAt: async count => {
            await gate.promise;
            order.push('confirm');
            return view.getInboxRollingHashAt(count);
          },
          getL1ToL2MessagesBetweenLeafCounts: (from, to) => view.getL1ToL2MessagesBetweenLeafCounts(from, to),
        },
        {
          parentTotalMsgCount: 2n,
          endTotalMsgCount: 3n,
          bucketRef: new InboxBucketRef(end.inboxRollingHash),
        },
      );

      // The read has happened; the confirmation is still blocked, so nothing has been handed back yet.
      await Promise.resolve();
      expect(order).toEqual(['read']);

      gate.resolve();
      expect(await pending).toEqual({ accepted: true, bundle: [new Fr(1002)] });
      expect(order).toEqual(['read', 'confirm']);
    });
  });

  describe('bundle derivation', () => {
    it('derives the bundle for a genesis-parent first block', async () => {
      const view = new FakeInboxView();
      const prefix = view.addMessages(3);
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(prefix.inboxRollingHash),
          endTotalMsgCount: 3n,
          parentTotalMsgCount: 0n,
        }),
      );
      expect(result).toEqual({ accepted: true, bundle: [new Fr(1000), new Fr(1001), new Fr(1002)] });
    });

    it('derives the bundle spanning everything since the parent count', async () => {
      const view = new FakeInboxView();
      view.addMessages(2); // parent consumed through here, total 2
      view.addMessages(2); // total 4
      const proposed = view.addMessages(1); // total 5
      const result = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(proposed.inboxRollingHash),
          endTotalMsgCount: 5n,
          parentTotalMsgCount: 2n,
        }),
      );
      expect(result).toEqual({ accepted: true, bundle: [new Fr(1002), new Fr(1003), new Fr(1004)] });
    });
  });

  describe('running-total accumulation across a checkpoint', () => {
    it('accumulates the per-checkpoint total across blocks against a fixed start', async () => {
      // Checkpoint starts at total 2. Blocks consume 2 messages each: totals 4, 6, 8.
      const view = new FakeInboxView();
      view.addMessages(2); // checkpoint start total 2
      const b2 = view.addMessages(2); // total 4
      view.addMessages(2); // total 6
      const b4 = view.addMessages(2); // total 8
      const checkpointStart = 2n;

      const r1 = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(b2.inboxRollingHash),
          endTotalMsgCount: 4n,
          parentTotalMsgCount: 2n,
          checkpointStartTotalMsgCount: checkpointStart,
          perCheckpointCap: 6,
        }),
      );
      expect(r1.accepted).toBe(true);

      // Checkpoint delta 8 - 2 = 6, exactly at the cap.
      const r3 = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(b4.inboxRollingHash),
          endTotalMsgCount: 8n,
          parentTotalMsgCount: 6n,
          checkpointStartTotalMsgCount: checkpointStart,
          perCheckpointCap: 6,
        }),
      );
      expect(r3.accepted).toBe(true);

      // Same block against a tighter cap of 5: the accumulated delta 6 now exceeds it.
      const r3Tight = await checkStreamingBlockProposal(
        baseInput({
          messageSource: view,
          bucketRef: new InboxBucketRef(b4.inboxRollingHash),
          endTotalMsgCount: 8n,
          parentTotalMsgCount: 6n,
          checkpointStartTotalMsgCount: checkpointStart,
          perCheckpointCap: 5,
        }),
      );
      expect(r3Tight).toEqual({ accepted: false, reason: 'checkpoint_over_msg_cap' });
    });
  });
});
