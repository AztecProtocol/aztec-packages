import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import '@aztec/stdlib/testing/jest';
import { TxHash } from '@aztec/stdlib/tx';

import {
  decodeKeyTail,
  decodeValue,
  encodeKey,
  encodePublicPrefix,
  encodeValue,
  endOfTagRange,
  endOfTxRange,
  fieldHex,
  incKey,
  u32Hex,
} from './log_store_codec.js';

describe('log_store_codec', () => {
  describe('u32Hex', () => {
    it('zero-pads to 8 lowercase hex chars', () => {
      expect(u32Hex(0)).toBe('00000000');
      expect(u32Hex(1)).toBe('00000001');
      expect(u32Hex(255)).toBe('000000ff');
      expect(u32Hex(0xdeadbeef)).toBe('deadbeef');
    });

    it('preserves big-endian lex ordering', () => {
      expect(u32Hex(2) < u32Hex(16)).toBe(true);
      expect(u32Hex(16) < u32Hex(256)).toBe(true);
      expect(u32Hex(256) < u32Hex(0xffff)).toBe(true);
    });
  });

  describe('fieldHex', () => {
    it('strips 0x prefix and returns 64 lowercase hex chars for Fr', () => {
      const fr = new Fr(0xabcdn);
      const hex = fieldHex(fr);
      expect(hex).toHaveLength(64);
      expect(hex).not.toMatch(/^0x/);
      expect(hex).toMatch(/^[0-9a-f]+$/);
      expect(hex).toBe(fr.toString().slice(2));
    });

    it('strips 0x prefix for AztecAddress', () => {
      const addr = AztecAddress.fromNumber(12345);
      const hex = fieldHex(addr);
      expect(hex).toHaveLength(64);
      expect(hex).not.toMatch(/^0x/);
      expect(hex).toBe(addr.toString().slice(2));
    });

    it('handles Fr.ZERO', () => {
      const hex = fieldHex(Fr.ZERO);
      expect(hex).toBe('0'.repeat(64));
    });
  });

  describe('encodeKey / decodeKeyTail', () => {
    it('round-trips a private-style prefix (single tag hex)', () => {
      const tagHex = fieldHex(new Fr(0x1234n));
      const key = encodeKey(tagHex, 5, 3, 7);
      const tail = decodeKeyTail(key);
      expect(tail.blockNumber).toBe(BlockNumber(5));
      expect(tail.txIndexWithinBlock).toBe(3);
      expect(tail.logIndexWithinTx).toBe(7);
    });

    it('round-trips a public-style prefix (contract-tag)', () => {
      const contractHex = fieldHex(AztecAddress.fromNumber(99));
      const tagHex = fieldHex(new Fr(0x5678n));
      const prefix = encodePublicPrefix(contractHex, tagHex);
      const key = encodeKey(prefix, 10, 0, 2);
      const tail = decodeKeyTail(key);
      expect(tail.blockNumber).toBe(BlockNumber(10));
      expect(tail.txIndexWithinBlock).toBe(0);
      expect(tail.logIndexWithinTx).toBe(2);
    });

    it('decodeKeyTail returns a branded BlockNumber', () => {
      const key = encodeKey('somepfx', 42, 1, 0);
      const tail = decodeKeyTail(key);
      // BlockNumber is a branded number; verify it equals the numeric value.
      expect(tail.blockNumber).toEqual(BlockNumber(42));
    });

    it('handles zero values in the tail triple', () => {
      const key = encodeKey('pfx', 0, 0, 0);
      const tail = decodeKeyTail(key);
      expect(tail.blockNumber).toEqual(BlockNumber(0));
      expect(tail.txIndexWithinBlock).toBe(0);
      expect(tail.logIndexWithinTx).toBe(0);
    });
  });

  describe('lexicographic key ordering', () => {
    it('sorts encoded keys in canonical (block, txIdx, logIdx) order', () => {
      const prefix = fieldHex(new Fr(0xdeadn));
      const tuples: [number, number, number][] = [
        [3, 0, 0],
        [1, 5, 2],
        [2, 0, 9],
        [1, 5, 0],
        [1, 0, 1],
        [3, 1, 0],
        [2, 3, 0],
        [1, 0, 0],
      ];
      const encodedKeys = tuples.map(([b, t, l]) => encodeKey(prefix, b, t, l));
      const sortedKeys = [...encodedKeys].sort();
      const decodedTails = sortedKeys.map(k => decodeKeyTail(k));

      // Verify that the decoded tails are in canonical tuple order.
      for (let i = 1; i < decodedTails.length; i++) {
        const a = decodedTails[i - 1];
        const b = decodedTails[i];
        const isOrdered =
          b.blockNumber > a.blockNumber ||
          (b.blockNumber === a.blockNumber && b.txIndexWithinBlock > a.txIndexWithinBlock) ||
          (b.blockNumber === a.blockNumber &&
            b.txIndexWithinBlock === a.txIndexWithinBlock &&
            b.logIndexWithinTx > a.logIndexWithinTx);
        expect(isOrdered).toBe(true);
      }
    });
  });

  describe('endOfTagRange', () => {
    it('with no upper bound returns a key that sorts after all real keys under the prefix', () => {
      const prefix = fieldHex(new Fr(0xaabbccn));
      const end = endOfTagRange(prefix, undefined);
      // Any real key at a high block number should sort before the end bound.
      const highKey = encodeKey(prefix, 0xffffffff, 0xffffffff, 0xffffffff);
      expect(highKey < end).toBe(true);
    });

    it('with upper bound returns encodeKey(prefix, upper, 0, 0)', () => {
      const prefix = fieldHex(new Fr(0x11n));
      const end = endOfTagRange(prefix, 10);
      expect(end).toBe(encodeKey(prefix, 10, 0, 0));
    });

    it('with upper bound sorts after all real keys within the block range', () => {
      const prefix = fieldHex(new Fr(0x22n));
      const end = endOfTagRange(prefix, 5);
      // Block 4 is the last included block (exclusive upper = 5).
      const lastKey = encodeKey(prefix, 4, 0xffff, 0xffff);
      expect(lastKey < end).toBe(true);
      // Block 5 is excluded.
      const excludedKey = encodeKey(prefix, 5, 0, 0);
      expect(excludedKey >= end).toBe(true);
    });
  });

  describe('endOfTxRange', () => {
    it('sorts strictly after every real log key for the given tx', () => {
      const prefix = fieldHex(new Fr(0x33n));
      const end = endOfTxRange(prefix, 7, 2);
      // All log indices within tx (7, 2) must be before the end.
      const lastLog = encodeKey(prefix, 7, 2, 0xffffffff);
      expect(lastLog < end).toBe(true);
    });

    it('sorts strictly before the next tx first key', () => {
      const prefix = fieldHex(new Fr(0x44n));
      const end = endOfTxRange(prefix, 7, 2);
      // The next tx (7, 3) should be strictly after our end bound.
      const nextTx = encodeKey(prefix, 7, 3, 0);
      expect(end < nextTx).toBe(true);
    });
  });

  describe('incKey', () => {
    it('returns the smallest string strictly greater than the input key', () => {
      const prefix = fieldHex(new Fr(0x55n));
      const key = encodeKey(prefix, 1, 2, 3);
      const next = incKey(key);
      expect(next > key).toBe(true);
    });

    it('an inclusive cursor becomes exclusive: no real key falls between key and incKey(key)', () => {
      const prefix = fieldHex(new Fr(0x66n));
      const key = encodeKey(prefix, 5, 1, 3);
      const nextKey = encodeKey(prefix, 5, 1, 4);
      const inc = incKey(key);
      // nextKey is the first real key after key; it must sort after inc or at inc.
      // In our scheme `inc = key + 'g'`, and `nextKey` ends in a hex digit, so nextKey > inc
      // cannot happen — nextKey should be strictly greater than key but less than inc only if
      // we haven't skipped a valid key. Since the last segment of key ends in hex and 'g' > 'f',
      // anything with a valid hex tail for the same position would sort before inc.
      expect(inc > key).toBe(true);
      expect(nextKey > inc).toBe(true);
    });
  });

  describe('encodeValue / decodeValue', () => {
    it('round-trips a value with empty logData', () => {
      const txHash = TxHash.random();
      const blockHash = BlockHash.random();
      const blockTimestamp = 1234567890n;
      const original = { txHash, blockHash, blockTimestamp, logData: [] };
      const buf = encodeValue(original);
      const decoded = decodeValue(buf);
      expect(decoded.txHash.equals(txHash)).toBe(true);
      expect(decoded.blockHash.equals(blockHash)).toBe(true);
      expect(decoded.blockTimestamp).toBe(blockTimestamp);
      expect(decoded.logData).toHaveLength(0);
    });

    it('round-trips a value with multiple logData fields', () => {
      const txHash = TxHash.random();
      const blockHash = BlockHash.random();
      const blockTimestamp = 9999999999n;
      const logData = [Fr.random(), Fr.random(), Fr.random()];
      const original = { txHash, blockHash, blockTimestamp, logData };
      const buf = encodeValue(original);
      const decoded = decodeValue(buf);
      expect(decoded.txHash.equals(txHash)).toBe(true);
      expect(decoded.blockHash.equals(blockHash)).toBe(true);
      expect(decoded.blockTimestamp).toBe(blockTimestamp);
      expect(decoded.logData).toHaveLength(3);
      for (let i = 0; i < logData.length; i++) {
        expect(decoded.logData[i].equals(logData[i])).toBe(true);
      }
    });

    it('handles a Uint8Array input in decodeValue', () => {
      const txHash = TxHash.random();
      const blockHash = BlockHash.random();
      const blockTimestamp = 0n;
      const original = { txHash, blockHash, blockTimestamp, logData: [Fr.random()] };
      const buf = encodeValue(original);
      // Convert to Uint8Array (not a Buffer).
      const uint8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
      const decoded = decodeValue(uint8);
      expect(decoded.txHash.equals(txHash)).toBe(true);
      expect(decoded.blockTimestamp).toBe(0n);
    });
  });

  describe('encodePublicPrefix', () => {
    it('produces contractHex-tagHex', () => {
      const contractHex = fieldHex(AztecAddress.fromNumber(1));
      const tagHex = fieldHex(new Fr(2n));
      expect(encodePublicPrefix(contractHex, tagHex)).toBe(`${contractHex}-${tagHex}`);
    });
  });
});
