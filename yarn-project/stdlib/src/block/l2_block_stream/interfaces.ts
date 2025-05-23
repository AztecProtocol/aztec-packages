import type { L2BlockId, L2Tips } from '../l2_block_source.js';
import type { PublishedL2Block } from '../published_l2_block.js';

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
      blocks: PublishedL2Block[];
    }
  | /** Reports last correct block (new tip of the unproven chain). */ {
      type: 'chain-pruned';
      block: L2BlockId;
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
