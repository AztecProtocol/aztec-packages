import { type BlockBlobData, type CheckpointBlobData, makeBlockEndBlobData } from '@aztec/blob-lib/encoding';
import type { InboxContract, MessageSentLog } from '@aztec/ethereum/contracts';
import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Body, CommitteeAttestation } from '@aztec/stdlib/block';
import { L1PublishedData } from '@aztec/stdlib/checkpoint';
import { updateInboxRollingHash } from '@aztec/stdlib/messaging';
import { CheckpointHeader } from '@aztec/stdlib/rollup';

import { mock } from 'jest-mock-extended';

import { type RetrievedCheckpoint, retrieveL1ToL2Messages, retrievedToPublishedCheckpoint } from './data_retrieval.js';

describe('data_retrieval', () => {
  describe('retrievedToPublishedCheckpoint', () => {
    it('handles multi-block checkpoint', async () => {
      // Create 3 different bodies with distinct transaction effects
      const body1 = await Body.random({ txsPerBlock: 2 });
      const body2 = await Body.random({ txsPerBlock: 2 });
      const body3 = await Body.random({ txsPerBlock: 2 });

      // Convert to BlockBlobData
      const block1BlobData = makeBlockBlobDataFromBody(body1, BlockNumber(1), 1000);
      const block2BlobData = makeBlockBlobDataFromBody(body2, BlockNumber(2), 2000);
      const block3BlobData = makeBlockBlobDataFromBody(body3, BlockNumber(3), 3000);

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

      // Each block's L1-to-L2 message tree root must be reconstructed from its own blob data, not the
      // checkpoint's first block. Any block can insert messages, so
      // intra-checkpoint blocks carry distinct roots; using the first block's root forks follower nodes.
      expect(reconstructedBlock1.header.state.l1ToL2MessageTree.root.toString()).toEqual(
        block1BlobData.l1ToL2MessageRoot.toString(),
      );
      expect(reconstructedBlock2.header.state.l1ToL2MessageTree.root.toString()).toEqual(
        block2BlobData.l1ToL2MessageRoot.toString(),
      );
      expect(reconstructedBlock3.header.state.l1ToL2MessageTree.root.toString()).toEqual(
        block3BlobData.l1ToL2MessageRoot.toString(),
      );
    });

    it('handles single-block checkpoint', async () => {
      const body1 = await Body.random({ txsPerBlock: 3 });
      const block1BlobData = makeBlockBlobDataFromBody(body1, BlockNumber(1), 5000);

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

  describe('retrieveL1ToL2Messages', () => {
    /** One MessageSent log per L1 block in `l1Blocks`, chained by index and rolling hash. */
    const makeLogs = (l1Blocks: bigint[]): MessageSentLog[] => {
      let rollingHash = Fr.ZERO;
      return l1Blocks.map((l1BlockNumber, i) => {
        const leaf = new Fr(1000 + i);
        rollingHash = updateInboxRollingHash(rollingHash, leaf);
        return {
          l1BlockNumber,
          l1BlockHash: Buffer32.fromBigInt(l1BlockNumber),
          l1TransactionHash: `0x${l1BlockNumber.toString(16)}`,
          args: { index: BigInt(i), leaf, inboxRollingHash: rollingHash, bucketSeq: 0n },
        } as MessageSentLog;
      });
    };

    /** An Inbox whose provider rejects log queries spanning more than `maxRange` blocks. */
    const mockInbox = (logs: MessageSentLog[], maxRange: bigint) => {
      const inbox = mock<InboxContract>();
      inbox.getMessageSentEvents.mockImplementation((from, to) =>
        to - from + 1n > maxRange
          ? Promise.reject(new Error('query returned more than 10000 results'))
          : Promise.resolve(logs.filter(log => log.l1BlockNumber >= from && log.l1BlockNumber <= to)),
      );
      return inbox;
    };

    it('bisects a range the provider rejects and returns every message in order', async () => {
      const logs = makeLogs([10n, 11n, 13n, 14n, 17n, 20n]);
      const inbox = mockInbox(logs, 3n);

      const messages = await retrieveL1ToL2Messages(inbox, 10n, 20n);

      expect(messages.map(m => m.index)).toEqual([0n, 1n, 2n, 3n, 4n, 5n]);
      expect(messages.map(m => m.l1BlockNumber)).toEqual([10n, 11n, 13n, 14n, 17n, 20n]);
      expect(messages[5].inboxRollingHash).toEqual(logs[5].args.inboxRollingHash);
    });

    it('reports a single block the provider cannot serve instead of returning fewer messages', async () => {
      const logs = makeLogs([10n, 11n, 12n]);
      const inbox = mockInbox(logs, 3n);
      inbox.getMessageSentEvents.mockImplementation((from, to) =>
        from <= 11n && to >= 11n
          ? Promise.reject(new Error('block 11 unavailable'))
          : Promise.resolve(logs.filter(log => log.l1BlockNumber >= from && log.l1BlockNumber <= to)),
      );

      await expect(retrieveL1ToL2Messages(inbox, 10n, 12n)).rejects.toThrow('block 11 unavailable');
    });
  });
});

/**
 * Helper to create a BlockBlobData from a Body. This ensures the blob data is compatible
 * with Body.fromTxBlobData.
 */
function makeBlockBlobDataFromBody(body: Body, blockNumber: BlockNumber, seed: number): BlockBlobData {
  const blockEndBlobData = makeBlockEndBlobData({
    seed,
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
