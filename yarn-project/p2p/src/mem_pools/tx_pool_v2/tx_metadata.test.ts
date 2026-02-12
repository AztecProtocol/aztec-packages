import { mockTx } from '@aztec/stdlib/testing';

import {
  type TxMetaData,
  buildTxMetaData,
  checkNullifierConflict,
  comparePriority,
  stubTxMetaValidationData,
} from './tx_metadata.js';

describe('TxMetaData', () => {
  describe('buildTxMetaData', () => {
    it('extracts all fields from a transaction', async () => {
      const tx = await mockTx(1);
      const meta = await buildTxMetaData(tx);

      expect(meta.txHash).toBe(tx.getTxHash().toString());
      expect(meta.anchorBlockHeaderHash).toBe((await tx.data.constants.anchorBlockHeader.hash()).toString());
      expect(meta.feePayer).toBe(tx.data.feePayer.toString());
      expect(meta.includeByTimestamp).toBe(tx.data.includeByTimestamp);
      expect(meta.minedL2BlockId).toBeUndefined();

      // Nullifiers should match the non-empty nullifiers from the tx
      const expectedNullifiers = tx.data.getNonEmptyNullifiers().map(n => n.toString());
      expect(meta.nullifiers).toEqual(expectedNullifiers);
    });

    it('extracts nullifiers as hex strings', async () => {
      const tx = await mockTx(1, { numberOfNonRevertiblePublicCallRequests: 1 });
      const meta = await buildTxMetaData(tx);

      expect(meta.nullifiers.length).toBeGreaterThan(0);
      for (const nullifier of meta.nullifiers) {
        expect(typeof nullifier).toBe('string');
        expect(nullifier).toMatch(/^0x[0-9a-f]+$/i);
      }
    });
  });

  describe('comparePriority', () => {
    const makeMeta = (fee: bigint, txHash = '0x1234'): TxMetaData => ({
      txHash,
      anchorBlockHeaderHash: '0x5678',
      priorityFee: fee,
      feePayer: '0xabcd',
      claimAmount: 0n,
      feeLimit: 1000n,
      nullifiers: [],
      includeByTimestamp: 0n,
      data: stubTxMetaValidationData(),
    });

    it('returns negative when first has lower priority fee', () => {
      expect(comparePriority(makeMeta(100n), makeMeta(200n))).toBe(-1);
    });

    it('returns positive when first has higher priority fee', () => {
      expect(comparePriority(makeMeta(200n), makeMeta(100n))).toBe(1);
    });

    it('uses txHash as tiebreaker when priority fees are equal', () => {
      // Lower hash comes first
      expect(comparePriority(makeMeta(100n, '0x1111'), makeMeta(100n, '0x2222'))).toBe(-1);
      expect(comparePriority(makeMeta(100n, '0x2222'), makeMeta(100n, '0x1111'))).toBe(1);
    });

    it('returns zero when both priority fee and txHash are equal', () => {
      expect(comparePriority(makeMeta(100n, '0x1234'), makeMeta(100n, '0x1234'))).toBe(0);
    });
  });

  describe('checkNullifierConflict', () => {
    const makeMeta = (txHash: string, priorityFee: bigint, nullifiers: string[]): TxMetaData => ({
      txHash,
      anchorBlockHeaderHash: '0x5678',
      priorityFee,
      feePayer: '0xabcd',
      claimAmount: 0n,
      feeLimit: 1000n,
      nullifiers,
      includeByTimestamp: 0n,
      data: stubTxMetaValidationData(),
    });

    it('returns no conflict when nullifiers do not overlap', () => {
      const incoming = makeMeta('0x1111', 100n, ['0xnull1', '0xnull2']);
      const existing = makeMeta('0x2222', 50n, ['0xnull3', '0xnull4']);

      const nullifierIndex = new Map<string, string>();
      for (const n of existing.nullifiers) {
        nullifierIndex.set(n, existing.txHash);
      }

      const result = checkNullifierConflict(
        incoming,
        n => nullifierIndex.get(n),
        () => existing,
      );

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toEqual([]);
    });

    it('evicts existing tx when incoming has higher priority', () => {
      const incoming = makeMeta('0x1111', 100n, ['0xnull1']);
      const existing = makeMeta('0x2222', 50n, ['0xnull1']);

      const result = checkNullifierConflict(
        incoming,
        () => existing.txHash,
        () => existing,
      );

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toEqual([existing.txHash]);
    });

    it('ignores incoming tx when existing has higher priority', () => {
      const incoming = makeMeta('0x1111', 50n, ['0xnull1']);
      const existing = makeMeta('0x2222', 100n, ['0xnull1']);

      const result = checkNullifierConflict(
        incoming,
        () => existing.txHash,
        () => existing,
      );

      expect(result.shouldIgnore).toBe(true);
      expect(result.txHashesToEvict).toEqual([]);
      expect(result.reason).toContain(existing.txHash);
    });

    it('ignores incoming tx when existing has equal priority (tie goes to existing)', () => {
      const incoming = makeMeta('0x1111', 100n, ['0xnull1']);
      const existing = makeMeta('0x2222', 100n, ['0xnull1']);

      const result = checkNullifierConflict(
        incoming,
        () => existing.txHash,
        () => existing,
      );

      expect(result.shouldIgnore).toBe(true);
      expect(result.txHashesToEvict).toEqual([]);
    });

    it('skips nullifiers that belong to the same transaction', () => {
      const incoming = makeMeta('0x1111', 100n, ['0xnull1']);

      const result = checkNullifierConflict(
        incoming,
        () => incoming.txHash, // Same tx owns the nullifier
        () => incoming,
      );

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toEqual([]);
    });

    it('handles multiple conflicting transactions', () => {
      const incoming = makeMeta('0x1111', 100n, ['0xnull1', '0xnull2', '0xnull3']);
      const existing1 = makeMeta('0x2222', 50n, ['0xnull1']);
      const existing2 = makeMeta('0x3333', 40n, ['0xnull2']);
      const existing3 = makeMeta('0x4444', 30n, ['0xnull3']);

      const nullifierIndex = new Map([
        ['0xnull1', existing1.txHash],
        ['0xnull2', existing2.txHash],
        ['0xnull3', existing3.txHash],
      ]);
      const metadataIndex = new Map([
        [existing1.txHash, existing1],
        [existing2.txHash, existing2],
        [existing3.txHash, existing3],
      ]);

      const result = checkNullifierConflict(
        incoming,
        n => nullifierIndex.get(n),
        h => metadataIndex.get(h),
      );

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toHaveLength(3);
      expect(result.txHashesToEvict).toContain(existing1.txHash);
      expect(result.txHashesToEvict).toContain(existing2.txHash);
      expect(result.txHashesToEvict).toContain(existing3.txHash);
    });

    it('stops and ignores when any conflicting tx has higher priority', () => {
      const incoming = makeMeta('0x1111', 100n, ['0xnull1', '0xnull2']);
      const existing1 = makeMeta('0x2222', 50n, ['0xnull1']); // Lower priority
      const existing2 = makeMeta('0x3333', 200n, ['0xnull2']); // Higher priority

      const nullifierIndex = new Map([
        ['0xnull1', existing1.txHash],
        ['0xnull2', existing2.txHash],
      ]);
      const metadataIndex = new Map([
        [existing1.txHash, existing1],
        [existing2.txHash, existing2],
      ]);

      const result = checkNullifierConflict(
        incoming,
        n => nullifierIndex.get(n),
        h => metadataIndex.get(h),
      );

      expect(result.shouldIgnore).toBe(true);
      expect(result.txHashesToEvict).toEqual([]);
    });

    it('deduplicates eviction list when same tx conflicts on multiple nullifiers', () => {
      const incoming = makeMeta('0x1111', 100n, ['0xnull1', '0xnull2']);
      const existing = makeMeta('0x2222', 50n, ['0xnull1', '0xnull2']);

      const result = checkNullifierConflict(
        incoming,
        () => existing.txHash, // Same tx owns both nullifiers
        () => existing,
      );

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toEqual([existing.txHash]); // Only listed once
    });

    it('skips nullifiers with no matching tx in pool', () => {
      const incoming = makeMeta('0x1111', 100n, ['0xnull1', '0xnull2']);

      const result = checkNullifierConflict(
        incoming,
        () => undefined, // No tx owns these nullifiers
        () => undefined,
      );

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toEqual([]);
    });

    it('skips when metadata lookup returns undefined', () => {
      const incoming = makeMeta('0x1111', 100n, ['0xnull1']);

      const result = checkNullifierConflict(
        incoming,
        () => '0x2222', // Nullifier owned by 0x2222
        () => undefined, // But metadata not found
      );

      expect(result.shouldIgnore).toBe(false);
      expect(result.txHashesToEvict).toEqual([]);
    });
  });
});
