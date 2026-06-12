import type { BlockNumber } from '@aztec/foundation/branded-types';

import type { L2Block } from '../l2_block.js';
import type { CheckpointId, L2BlockId, L2TipId, LocalL2Tips } from '../l2_block_source.js';

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
  Pick<L2BlockStreamLocalDataProvider, 'getL2BlockHash'>;
