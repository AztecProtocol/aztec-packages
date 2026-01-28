import { mockTx } from '@aztec/stdlib/testing';

import { type TxMetaData, buildTxMetaData, comparePriority, getMetadataPriority } from './tx_metadata.js';

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

  describe('getMetadataPriority', () => {
    it('returns a padded hex string', () => {
      const meta: TxMetaData = {
        txHash: '0x1234',
        anchorBlockHeaderHash: '0x5678',
        priorityFee: 255n,
        feePayer: '0xabcd',
        claimAmount: 0n,
        feeLimit: 1000n,
        nullifiers: [],
      };

      const priority = getMetadataPriority(meta);
      expect(priority).toHaveLength(32);
      expect(priority).toMatch(/^[0-9a-f]+$/);
    });

    it('maintains sorting order (higher fee = higher priority string)', () => {
      const lowFee: TxMetaData = {
        txHash: '0x1',
        anchorBlockHeaderHash: '0x1',
        priorityFee: 100n,
        feePayer: '0x1',
        claimAmount: 0n,
        feeLimit: 1000n,
        nullifiers: [],
      };

      const highFee: TxMetaData = {
        txHash: '0x2',
        anchorBlockHeaderHash: '0x2',
        priorityFee: 1000n,
        feePayer: '0x2',
        claimAmount: 0n,
        feeLimit: 1000n,
        nullifiers: [],
      };

      expect(getMetadataPriority(highFee) > getMetadataPriority(lowFee)).toBe(true);
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
