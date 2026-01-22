import type { PublishedCheckpoint } from '../../checkpoint/published_checkpoint.js';
import type { L2Block } from '../l2_block.js';
import type { CheckpointId, L2BlockId, L2Tips } from '../l2_block_source.js';

/** Interface to the local view of the chain. Implemented by world-state and l2-tips-store. */
export interface L2BlockStreamLocalDataProvider {
  getL2BlockHash(number: number): Promise<string | undefined>;
  getL2Tips(): Promise<L2Tips>;
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
  | /** Emits checkpoints published to L1. */ {
      type: 'chain-checkpointed';
      checkpoint: PublishedCheckpoint;
      block: L2BlockId;
    }
  | /**
   * Reports last correct block (new tip of the proposed chain). Note that this is not necessarily the anchor block
   * that will be used in the transaction - if the chain has already moved past the reorg, we'll also see blocks-added
   * events that will push the anchor block forward.
   */ {
      type: 'chain-pruned';
      block: L2BlockId;
      checkpoint: CheckpointId;
    }
  | /** Reports new proven block. */ {
      type: 'chain-proven';
      block: L2BlockId;
    }
  | /** Reports new finalized block (proven and finalized on L1). */ {
      type: 'chain-finalized';
      block: L2BlockId;
    };

export type L2TipsStore = L2BlockStreamEventHandler & L2BlockStreamLocalDataProvider;
