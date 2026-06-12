import { type BlockData, type BlockQuery, type BlocksQuery, L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * Lifts an {@link AztecNode} RPC client into the shape {@link L2BlockStream} expects.
 * `getBlocks` requests transaction bodies so that real `L2Block` instances can be constructed. The stream no
 * longer fetches checkpoint payloads (the `chain-checkpointed` event is a thin tip event), so `getCheckpoints`
 * is not part of the lifted shape.
 */
export function blockStreamSourceFromAztecNode(
  node: AztecNode,
): Pick<L2BlockSource, 'getBlocks' | 'getBlockData' | 'getL2Tips'> {
  return {
    getL2Tips: async () => {
      const tips = await node.getChainTips();
      return { ...tips, proposedCheckpoint: tips.checkpointed };
    },

    async getBlockData(query: BlockQuery): Promise<BlockData | undefined> {
      const response = await node.getBlock(query);
      if (!response) {
        return undefined;
      }
      return {
        header: response.header,
        archive: response.archive,
        blockHash: response.hash,
        checkpointNumber: response.checkpointNumber,
        indexWithinCheckpoint: response.indexWithinCheckpoint,
      };
    },

    async getBlocks(query: BlocksQuery): Promise<L2Block[]> {
      // Epoch lookups are not exposed on the public AztecNode RPC; only `from + limit` is.
      if (!('from' in query)) {
        throw new Error('getBlocks with epoch query not supported via AztecNode RPC');
      }
      if (query.onlyCheckpointed) {
        throw new Error('getBlocks with onlyCheckpointed not supported via AztecNode RPC');
      }
      const responses = await node.getBlocks(query.from, query.limit, { includeTransactions: true });
      return responses.map(r => new L2Block(r.archive, r.header, r.body!, r.checkpointNumber, r.indexWithinCheckpoint));
    },
  };
}
