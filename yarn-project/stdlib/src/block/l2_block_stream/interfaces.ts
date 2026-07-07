import type { BlockNumber } from '@aztec/foundation/branded-types';

import type { L2Block } from '../l2_block.js';
import type { CheckpointId, L2BlockId, L2TipId, L2Tips, LocalL2Tips } from '../l2_block_source.js';

/** Provides the current chain tips. Implemented by world-state, l2-tips-store, and AztecNode. */
export interface L2TipsProvider {
  getL2Tips(): Promise<LocalL2Tips>;
}

/**
 * A block id reported by a local data provider, whose hash may be unknown when the provider cannot resolve it (e.g.
 * world-state cannot resolve the hash of a proven tip ahead of its synced range).
 */
export type LocalL2BlockId = { number: BlockNumber; hash?: string };

/**
 * Minimal local view of the chain the block stream needs to drive sync. `checkpointed` is only required when the
 * stream emits checkpoint events (i.e. `ignoreCheckpoints` is off).
 */
export type LocalChainTips = {
  proposed: LocalL2BlockId;
  checkpointed?: { block: LocalL2BlockId; checkpoint: CheckpointId };
  proven: { block: LocalL2BlockId };
  finalized: { block: LocalL2BlockId };
};

/**
 * Interface to the local view of the chain. Implemented by world-state and l2-tips-store. Anything implementing
 * {@link L2TipsProvider} also satisfies this contract structurally, since {@link LocalL2Tips} is assignable to
 * {@link LocalChainTips}.
 */
export interface L2BlockStreamLocalDataProvider {
  getL2Tips(): Promise<LocalChainTips>;
  getL2BlockHash(number: number): Promise<string | undefined>;
}

/**
 * Returns whether a local block id differs from a source block id. Compares block number and, when the local hash is
 * known, block hash. The hash comparison is skipped when the local hash is undefined: world-state legitimately
 * reports `undefined` hashes for tips ahead of its synced range, and comparing against an undefined hash would treat
 * such a tip as different on every poll. An `undefined` local block (no local tip yet) always counts as differing.
 */
export function localBlockIdDiffers(localBlock: LocalL2BlockId | undefined, sourceBlock: L2BlockId): boolean {
  if (localBlock === undefined) {
    return true;
  }
  if (sourceBlock.number !== localBlock.number) {
    return true;
  }
  if (localBlock.hash === undefined) {
    return false;
  }
  return sourceBlock.hash !== localBlock.hash;
}

/**
 * Returns whether the local chain tips agree with the given source tips on every tier the local provider exposes.
 * Each tier is compared at the block level via {@link localBlockIdDiffers} (so an unresolved local hash matches on
 * number alone); checkpoint ids are not compared, mirroring the stream's own tier reconciliation. The optional
 * `checkpointed` tier is only compared when present (it is absent when the stream ignores checkpoints).
 */
export function localTipsMatch(local: LocalChainTips, source: L2Tips): boolean {
  return (
    !localBlockIdDiffers(local.proposed, source.proposed) &&
    (local.checkpointed === undefined || !localBlockIdDiffers(local.checkpointed.block, source.checkpointed.block)) &&
    !localBlockIdDiffers(local.proven.block, source.proven.block) &&
    !localBlockIdDiffers(local.finalized.block, source.finalized.block)
  );
}

/** Interface to a handler of events emitted. */
export interface L2BlockStreamEventHandler {
  handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void>;
}

export type L2BlockStreamEvent =
  | /** Emits blocks added to the chain. */ {
      type: 'blocks-added';
      blocks: L2Block[];
    }
  | /**
   * Reports the new proposed tip of the chain. Emitted once per sync pass when the source's proposed tip differs
   * from the pre-pass local one (downloads, a prune, or a thin tip movement). Carries only the block id; in block
   * mode the corresponding payloads arrive via preceding `blocks-added` events, while in tips-only mode this is the
   * sole signal that the proposed tip moved. Consumers that only track the proposed tip can ignore `blocks-added`
   * entirely and anchor on this event instead.
   */ {
      type: 'chain-proposed';
      block: L2BlockId;
    }
  | /**
   * Reports a new checkpointed tip. Emitted at most once per sync pass when the source's checkpointed tip
   * leads the local one. Carries only the block + checkpoint ids; consumers that need the full checkpoint
   * payload fetch it on demand from the block source.
   */ {
      type: 'chain-checkpointed';
      block: L2BlockId;
      checkpoint: CheckpointId;
    }
  | /**
   * Reports last correct block (new tip of the proposed chain). Note that this is not necessarily the anchor block
   * that will be used in the transaction - if the chain has already moved past the reorg, we'll also see blocks-added
   * events that will push the anchor block forward. `block` is the prune target (the new proposed tip); `checkpointed`
   * and `proven` are the source's confirmed checkpointed and proven tips (each a block and checkpoint id). Each is used
   * to clamp the corresponding local cursor when it leads the source tip, so a cursor never overshoots its own source
   * frontier during a prune (the source guarantees proven <= checkpointed).
   */ {
      type: 'chain-pruned';
      block: L2BlockId;
      checkpointed: L2TipId;
      proven: L2TipId;
    }
  | /** Reports new proven block. */ {
      type: 'chain-proven';
      block: L2BlockId;
      checkpoint: CheckpointId;
    }
  | /** Reports new finalized block (proven and finalized on L1). */ {
      type: 'chain-finalized';
      block: L2BlockId;
      checkpoint: CheckpointId;
    };

export type L2TipsStore = L2BlockStreamEventHandler &
  L2TipsProvider &
  Pick<L2BlockStreamLocalDataProvider, 'getL2BlockHash'> & {
    /**
     * Records `(number → hash)` witnesses into the walk-back hash index without moving any tip cursor. Consumers that
     * materialize per-height state should record a witness for each height they materialize, so a reorg below the
     * nearest sparse anchor does not produce an over-deep prune event. See {@link L2TipsStoreBase.recordBlockHashes}.
     */
    recordBlockHashes(blocks: L2BlockId[]): Promise<void>;
  };
