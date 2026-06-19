import { Fr } from '@aztec/foundation/curves/bn254';

import { CheckpointHeader } from './checkpoint_header.js';
import {
  type L1CheckpointHeader,
  OutOfRangeFieldError,
  getOutOfRangeFields,
  l1CheckpointHeaderHash,
  toCheckpointHeader,
  toL1CheckpointHeader,
  tryToCheckpointHeader,
} from './l1_checkpoint_header.js';

const MODULUS_HEX = `0x${Fr.MODULUS.toString(16).padStart(64, '0')}` as `0x${string}`;
const MAX_UINT256 = 2n ** 256n - 1n;
const MAX_UINT256_HEX = `0x${MAX_UINT256.toString(16)}` as `0x${string}`;

describe('L1CheckpointHeader', () => {
  describe('l1CheckpointHeaderHash', () => {
    it('equals CheckpointHeader.hash for random in-range headers (pins the byte layout)', () => {
      for (let i = 0; i < 20; i++) {
        const header = CheckpointHeader.random();
        expect(l1CheckpointHeaderHash(toL1CheckpointHeader(header)).toString()).toEqual(header.hash().toString());
      }
    });

    it('produces an in-range hash even when a field is out of range', () => {
      const raw = toL1CheckpointHeader(CheckpointHeader.random());
      raw.accumulatedFees = MAX_UINT256;
      const hash = l1CheckpointHeaderHash(raw);
      expect(hash.toBigInt()).toBeLessThan(Fr.MODULUS);
    });
  });

  describe('round-trip', () => {
    it('toL1CheckpointHeader then toCheckpointHeader recovers the original header', () => {
      const header = CheckpointHeader.random();
      const recovered = toCheckpointHeader(toL1CheckpointHeader(header));
      expect(recovered.equals(header)).toBe(true);
    });
  });

  describe('out-of-range field detection', () => {
    // The exploitable Fr-valued fields plus the others that are also Fr-valued on the wire.
    const exploitableFields: (keyof L1CheckpointHeader)[] = [
      'lastArchiveRoot',
      'blockHeadersHash',
      'blobsHash',
      'inHash',
      'outHash',
      'feeRecipient',
      'totalManaUsed',
      'accumulatedFees',
    ];

    const hexFields = new Set<keyof L1CheckpointHeader>([
      'lastArchiveRoot',
      'blockHeadersHash',
      'blobsHash',
      'inHash',
      'outHash',
      'feeRecipient',
    ]);

    const setField = (raw: L1CheckpointHeader, field: keyof L1CheckpointHeader, value: bigint): L1CheckpointHeader => ({
      ...raw,
      [field]: hexFields.has(field) ? (`0x${value.toString(16).padStart(64, '0')}` as `0x${string}`) : value,
    });

    it('accepts an in-range header (every field at MODULUS - 1)', () => {
      let raw = toL1CheckpointHeader(CheckpointHeader.random());
      for (const field of exploitableFields) {
        raw = setField(raw, field, Fr.MODULUS - 1n);
      }
      expect(getOutOfRangeFields(raw)).toEqual([]);
      expect(() => toCheckpointHeader(raw)).not.toThrow();
    });

    for (const field of exploitableFields) {
      it(`flags ${field} when set to exactly MODULUS`, () => {
        const raw = setField(toL1CheckpointHeader(CheckpointHeader.random()), field, Fr.MODULUS);
        expect(getOutOfRangeFields(raw)).toContain(field);
        const result = tryToCheckpointHeader(raw);
        expect(result.ok).toBe(false);
        expect(() => toCheckpointHeader(raw)).toThrow(OutOfRangeFieldError);
      });

      it(`flags ${field} when set to 2^256 - 1`, () => {
        const raw = setField(toL1CheckpointHeader(CheckpointHeader.random()), field, MAX_UINT256);
        expect(getOutOfRangeFields(raw)).toContain(field);
        expect(() => toCheckpointHeader(raw)).toThrow(OutOfRangeFieldError);
      });
    }

    it('OutOfRangeFieldError carries the offending field names', () => {
      let raw = toL1CheckpointHeader(CheckpointHeader.random());
      raw = setField(raw, 'accumulatedFees', MAX_UINT256);
      raw = setField(raw, 'outHash', BigInt(MODULUS_HEX));
      try {
        toCheckpointHeader(raw);
        throw new Error('expected toCheckpointHeader to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(OutOfRangeFieldError);
        expect((err as OutOfRangeFieldError).fields).toEqual(expect.arrayContaining(['outHash', 'accumulatedFees']));
      }
    });

    it('rejects an out-of-range header passed as 2^256 - 1 hex on a hash field', () => {
      const raw = { ...toL1CheckpointHeader(CheckpointHeader.random()), inHash: MAX_UINT256_HEX };
      expect(getOutOfRangeFields(raw)).toContain('inHash');
    });
  });
});
