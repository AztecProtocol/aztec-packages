import { type BlockBlobData, type CheckpointBlobData, makeBlockEndBlobData } from '@aztec/blob-lib/encoding';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Body, CommitteeAttestation } from '@aztec/stdlib/block';
import { L1PublishedData } from '@aztec/stdlib/checkpoint';
import { CheckpointHeader } from '@aztec/stdlib/rollup';

import { type RetrievedCheckpoint, retrievedToPublishedCheckpoint } from './data_retrieval.js';

describe('data_retrieval', () => {
  describe('retrievedToPublishedCheckpoint', () => {
    it('handles multi-block checkpoint', async () => {
      // Create 3 different bodies with distinct transaction effects
      const body1 = await Body.random({ txsPerBlock: 2 });
      const body2 = await Body.random({ txsPerBlock: 2 });
      const body3 = await Body.random({ txsPerBlock: 2 });

      // Convert to BlockBlobData
      const block1BlobData = makeBlockBlobDataFromBody(body1, BlockNumber(1), true, 1000);
      const block2BlobData = makeBlockBlobDataFromBody(body2, BlockNumber(2), false, 2000);
      const block3BlobData = makeBlockBlobDataFromBody(body3, BlockNumber(3), false, 3000);

      // Calculate total blob fields for checkpoint end marker
      const numBlobFields = 100; // Approximate, doesn't need to be exact for this test

      const checkpointBlobData: CheckpointBlobData = {
        blocks: [block1BlobData, block2BlobData, block3BlobData],
        checkpointEndMarker: { numBlobFields },
      };

      const archiveRoot = Fr.random();

      const retrievedCheckpoint: RetrievedCheckpoint = {
        checkpointNumber: CheckpointNumber(1),
        archiveRoot,
        feeAssetPriceModifier: 0n,
        header: CheckpointHeader.random(),
        checkpointBlobData,
        l1: new L1PublishedData(1n, 1000n, '0x1234'),
        chainId: new Fr(1),
        version: new Fr(1),
        attestations: [CommitteeAttestation.empty()],
      };

      const publishedCheckpoint = await retrievedToPublishedCheckpoint(retrievedCheckpoint);

      // Verify we got 3 blocks
      expect(publishedCheckpoint.checkpoint.blocks).toHaveLength(3);

      // Verify each block has the correct number of txs
      for (const block of publishedCheckpoint.checkpoint.blocks) {
        expect(block.body.txEffects).toHaveLength(2);
      }

      // The critical assertion: each block should have the tx hashes from its corresponding body
      const reconstructedBlock1 = publishedCheckpoint.checkpoint.blocks[0];
      const reconstructedBlock2 = publishedCheckpoint.checkpoint.blocks[1];
      const reconstructedBlock3 = publishedCheckpoint.checkpoint.blocks[2];

      // Block 1 should have body1's tx hashes
      expect(reconstructedBlock1.body.txEffects.map(tx => tx.txHash.toString())).toEqual(
        body1.txEffects.map(tx => tx.txHash.toString()),
      );

      // Block 2 should have body2's tx hashes
      expect(reconstructedBlock2.body.txEffects.map(tx => tx.txHash.toString())).toEqual(
        body2.txEffects.map(tx => tx.txHash.toString()),
      );

      // Block 3 should have body3's tx hashes
      expect(reconstructedBlock3.body.txEffects.map(tx => tx.txHash.toString())).toEqual(
        body3.txEffects.map(tx => tx.txHash.toString()),
      );

      // Also verify blocks are distinct from each other
      expect(reconstructedBlock1.body.txEffects.map(tx => tx.txHash.toString())).not.toEqual(
        reconstructedBlock2.body.txEffects.map(tx => tx.txHash.toString()),
      );
      expect(reconstructedBlock1.body.txEffects.map(tx => tx.txHash.toString())).not.toEqual(
        reconstructedBlock3.body.txEffects.map(tx => tx.txHash.toString()),
      );
    });

    it('handles single-block checkpoint', async () => {
      const body1 = await Body.random({ txsPerBlock: 3 });
      const block1BlobData = makeBlockBlobDataFromBody(body1, BlockNumber(1), true, 5000);

      const checkpointBlobData: CheckpointBlobData = {
        blocks: [block1BlobData],
        checkpointEndMarker: { numBlobFields: 50 },
      };

      const archiveRoot = Fr.random();

      const retrievedCheckpoint: RetrievedCheckpoint = {
        checkpointNumber: CheckpointNumber(1),
        archiveRoot,
        feeAssetPriceModifier: 0n,
        header: CheckpointHeader.random(),
        checkpointBlobData,
        l1: new L1PublishedData(1n, 1000n, '0x1234'),
        chainId: new Fr(1),
        version: new Fr(1),
        attestations: [],
      };

      const publishedCheckpoint = await retrievedToPublishedCheckpoint(retrievedCheckpoint);

      expect(publishedCheckpoint.checkpoint.blocks).toHaveLength(1);
      expect(publishedCheckpoint.checkpoint.blocks[0].body.txEffects).toHaveLength(3);

      // Verify tx hashes match the original body
      expect(publishedCheckpoint.checkpoint.blocks[0].body.txEffects.map(tx => tx.txHash.toString())).toEqual(
        body1.txEffects.map(tx => tx.txHash.toString()),
      );
    });
  });
});

/**
 * Helper to create a BlockBlobData from a Body. This ensures the blob data is compatible
 * with Body.fromTxBlobData.
 */
function makeBlockBlobDataFromBody(
  body: Body,
  blockNumber: BlockNumber,
  isFirstBlock: boolean,
  seed: number,
): BlockBlobData {
  const blockEndBlobData = makeBlockEndBlobData({
    seed,
    isFirstBlock,
    blockEndMarker: {
      numTxs: body.txEffects.length,
      blockNumber,
      timestamp: BigInt(1000 + blockNumber),
    },
  });

  return {
    txs: body.toTxBlobData(),
    ...blockEndBlobData,
  };
}
