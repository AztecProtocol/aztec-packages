import { jsonStringify } from '@aztec/foundation/json-rpc';

import { LogCursor } from './log_cursor.js';
import { LogResult } from './log_result.js';

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
    const log = LogResult.random();
    const cursor = LogCursor.fromLog(log);
    expect(cursor.blockNumber).toBe(log.blockNumber);
    expect(cursor.txHash.equals(log.txHash)).toBe(true);
    expect(cursor.logIndexWithinTx).toBe(log.logIndexWithinTx);
  });

  it('cursors are equal iff all three fields match', () => {
    const a = LogCursor.random();
    const b = new LogCursor(a.blockNumber, a.txHash, a.logIndexWithinTx);
    expect(a.equals(b)).toBe(true);

    const differentLogIndex = new LogCursor(a.blockNumber, a.txHash, a.logIndexWithinTx + 1);
    expect(a.equals(differentLogIndex)).toBe(false);
  });
});
