import { mockTx } from '@aztec/stdlib/testing';

import { type TxMetaData, buildTxMetaData, comparePriority } from './tx_metadata.js';

describe('TxMetaData', () => {
  describe('buildTxMetaData', () => {
    it('extracts all fields from a transaction', async () => {
      const tx = await mockTx(1);
      const meta = await buildTxMetaData(tx);

      expect(meta.txHash).toBe(tx.getTxHash().toString());
      expect(meta.anchorBlockHeaderHash).toBeDefined();
      expect(meta.priorityFee).toBeGreaterThanOrEqual(0n);
      expect(meta.feePayer).toBe(tx.data.feePayer.toString());
      expect(meta.nullifiers.length).toBeGreaterThan(0);
      expect(meta.minedL2BlockId).toBeUndefined();
    });

    it('extracts nullifiers as strings', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      const meta = await buildTxMetaData(tx);

      for (const nullifier of meta.nullifiers) {
        expect(typeof nullifier).toBe('string');
        expect(nullifier).toMatch(/^0x[0-9a-f]+$/i);
      }
    });
  });

  describe('comparePriority', () => {
    const makeMeta = (fee: bigint): TxMetaData => ({
      txHash: '0x1234',
      anchorBlockHeaderHash: '0x5678',
      priorityFee: fee,
      feePayer: '0xabcd',
      claimAmount: 0n,
      feeLimit: 1000n,
      nullifiers: [],
      includeByTimestamp: 0n,
    });

    it('returns negative when first has lower priority', () => {
      expect(comparePriority(makeMeta(100n), makeMeta(200n))).toBeLessThan(0);
    });

    it('returns positive when first has higher priority', () => {
      expect(comparePriority(makeMeta(200n), makeMeta(100n))).toBeGreaterThan(0);
    });

    it('returns zero when priorities are equal', () => {
      expect(comparePriority(makeMeta(100n), makeMeta(100n))).toBe(0);
    });
  });
});
