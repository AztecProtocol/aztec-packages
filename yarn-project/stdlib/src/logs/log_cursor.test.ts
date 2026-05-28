import { BlockNumber } from '@aztec/foundation/branded-types';
import { jsonStringify } from '@aztec/foundation/json-rpc';

import { LogCursor } from './log_cursor.js';
import { randomLogResult } from './log_result.js';

describe('LogCursor', () => {
  it('round-trips through toBuffer/fromBuffer', () => {
    const cursor = LogCursor.random();
    const parsed = LogCursor.fromBuffer(cursor.toBuffer());
    expect(parsed.equals(cursor)).toBe(true);
  });

  it('round-trips through the zod schema', () => {
    const cursor = LogCursor.random();
    const parsed = LogCursor.schema.parse(JSON.parse(jsonStringify(cursor)));
    expect(parsed.equals(cursor)).toBe(true);
  });

  it('fromLog reads the cursor fields from a log', () => {
    const log = randomLogResult();
    const cursor = LogCursor.fromLog(log);
    expect(cursor.blockNumber).toBe(log.blockNumber);
    expect(cursor.txIndexWithinBlock).toBe(log.txIndexWithinBlock);
    expect(cursor.logIndexWithinTx).toBe(log.logIndexWithinTx);
  });

  it('cursors are equal iff all three fields match', () => {
    const a = LogCursor.random();
    const b = new LogCursor(a.blockNumber, a.txIndexWithinBlock, a.logIndexWithinTx);
    expect(a.equals(b)).toBe(true);

    const differentLogIndex = new LogCursor(a.blockNumber, a.txIndexWithinBlock, a.logIndexWithinTx + 1);
    expect(a.equals(differentLogIndex)).toBe(false);

    const differentTxIndex = new LogCursor(a.blockNumber, a.txIndexWithinBlock + 1, a.logIndexWithinTx);
    expect(a.equals(differentTxIndex)).toBe(false);
  });

  describe('toString / parseOptional', () => {
    it('round-trips toString via parseOptional', () => {
      const cursor = new LogCursor(BlockNumber(42), 3, 7);
      expect(cursor.toString()).toBe('42-3-7');
      const parsed = LogCursor.parseOptional(cursor.toString())!;
      expect(parsed.equals(cursor)).toBe(true);
    });

    it('returns undefined for empty input', () => {
      expect(LogCursor.parseOptional('')).toBeUndefined();
    });

    it('rejects malformed strings', () => {
      expect(() => LogCursor.parseOptional('1-2')).toThrow(/Invalid log cursor/);
      expect(() => LogCursor.parseOptional('a-b-c')).toThrow(/block number/);
      expect(() => LogCursor.parseOptional('1-x-3')).toThrow(/tx index/);
      expect(() => LogCursor.parseOptional('1-2-y')).toThrow(/log index/);
      expect(() => LogCursor.parseOptional('0-0-0')).toThrow(/block number/);
    });
  });
});
