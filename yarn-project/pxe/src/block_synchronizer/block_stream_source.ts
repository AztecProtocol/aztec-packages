import type { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { L2Block, type L2BlockSource } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';

// TODO(spl/new-rpc-api): delete once `L2BlockStream` is refactored to consume the new
// `BlockResponse` / `CheckpointResponse` shapes. For now the stream requires concrete `L2Block`
// and `PublishedCheckpoint` instances, so we rehydrate them from RPC responses.
/**
 * Lifts an {@link AztecNode} RPC client into the shape {@link L2BlockStream} expects. `getBlocks`
 * requests transaction bodies so that real `L2Block` instances can be constructed;
 * `getCheckpoints` requests blocks + L1 info + attestations so that `PublishedCheckpoint`
 * instances are fully populated.
 */
export function blockStreamSourceFromAztecNode(
  node: AztecNode,
): Pick<L2BlockSource, 'getBlocks' | 'getBlockHeader' | 'getL2Tips' | 'getCheckpoints' | 'getCheckpointedBlocks'> {
  return {
    getL2Tips: () => node.getL2Tips(),
    getBlockHeader: number => node.getBlockHeader(number),
    getCheckpointedBlocks: (from: BlockNumber, limit: number) => node.getCheckpointedBlocks(from, limit),

    async getBlocks(from: BlockNumber, limit: number): Promise<L2Block[]> {
      const responses = await node.getBlocks(from, limit, { includeTransactions: true });
      return responses.map(r => new L2Block(r.archive, r.header, r.body!, r.checkpointNumber, r.indexWithinCheckpoint));
    },

    async getCheckpoints(from: CheckpointNumber, limit: number): Promise<PublishedCheckpoint[]> {
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
