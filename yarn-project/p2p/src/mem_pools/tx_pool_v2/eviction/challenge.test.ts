import type { TxMetaData } from '../tx_metadata.js';
import { canWinChallenge, resolveChallenge } from './challenge.js';

describe('Challenge', () => {
  const makeMeta = (txHash: string, priorityFee: bigint): TxMetaData => ({
    txHash,
    anchorBlockHeaderHash: '0x1234',
    priorityFee,
    feePayer: '0xabcd',
    claimAmount: 0n,
    feeLimit: 1000n,
    nullifiers: [],
  });

  describe('resolveChallenge', () => {
    it('incoming wins with higher fee', () => {
      const incoming = makeMeta('0x1', 200n);
      const existing = makeMeta('0x2', 100n);

      const result = resolveChallenge(incoming, existing);

      expect(result.incomingWins).toBe(true);
      expect(result.reason).toContain('incoming has higher fee');
    });

    it('existing wins with higher fee', () => {
      const incoming = makeMeta('0x1', 100n);
      const existing = makeMeta('0x2', 200n);

      const result = resolveChallenge(incoming, existing);

      expect(result.incomingWins).toBe(false);
      expect(result.reason).toContain('existing has higher fee');
    });

    it('existing wins on tie', () => {
      const incoming = makeMeta('0x1', 100n);
      const existing = makeMeta('0x2', 100n);

      const result = resolveChallenge(incoming, existing);

      expect(result.incomingWins).toBe(false);
      expect(result.reason).toContain('tie');
      expect(result.reason).toContain('existing wins');
    });
  });

  describe('canWinChallenge', () => {
    it('returns true when incoming fee is strictly higher', () => {
      expect(canWinChallenge(200n, 100n)).toBe(true);
    });

    it('returns false when incoming fee is lower', () => {
      expect(canWinChallenge(100n, 200n)).toBe(false);
    });

    it('returns false on tie (existing wins ties)', () => {
      expect(canWinChallenge(100n, 100n)).toBe(false);
    });
  });
});
