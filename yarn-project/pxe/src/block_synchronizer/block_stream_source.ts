import { Fr } from '@aztec/foundation/curves/bn254';
import {
  type BlockData,
  type BlockQuery,
  type BlocksQuery,
  type CheckpointsQuery,
  L2Block,
  type L2BlockSource,
} from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

/**
 * Lifts an {@link AztecNode} RPC client into the shape {@link L2BlockStream} expects.
 * `getBlocks` requests transaction bodies so that real `L2Block` instances can be constructed;
 * `getCheckpoints` requests blocks + L1 info + attestations so that `PublishedCheckpoint`
 * instances are fully populated.
 */
export function blockStreamSourceFromAztecNode(
  node: AztecNode,
): Pick<L2BlockSource, 'getBlocks' | 'getBlockData' | 'getL2Tips' | 'getCheckpoints'> {
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

    async getCheckpoints(query: CheckpointsQuery): Promise<PublishedCheckpoint[]> {
      if (!('from' in query)) {
        throw new Error('getCheckpoints with epoch query not supported via AztecNode RPC');
      }
      const { from, limit } = query;
      const responses = await node.getCheckpoints(from, limit, {
        includeBlocks: true,
        includeTransactions: true,
        includeL1PublishInfo: true,
        includeAttestations: true,
      });
      return responses.map(r => {
        const checkpoint = new Checkpoint(
          r.archive,
          r.header,
          r.blocks!.map(b => new L2Block(b.archive, b.header, b.body!, b.checkpointNumber, b.indexWithinCheckpoint)),
          r.number,
          r.feeAssetPriceModifier,
        );
        const l1 =
          r.l1?.published === true
            ? new L1PublishedData(r.l1.blockNumber, r.l1.timestamp, r.l1.blockHash)
            : new L1PublishedData(0n, 0n, Fr.ZERO.toString());
        return new PublishedCheckpoint(checkpoint, l1, r.attestations ?? []);
      });
    },
  };
}
