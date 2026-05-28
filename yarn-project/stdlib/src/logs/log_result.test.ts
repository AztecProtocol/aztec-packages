import { jsonStringify } from '@aztec/foundation/json-rpc';

import { LogResult } from './log_result.js';

describe('LogResult', () => {
  it('round-trips through toBuffer/fromBuffer without effects', () => {
    const log = LogResult.random(false);
    expect(log.noteHashes).toBeUndefined();
    expect(log.nullifiers).toBeUndefined();

    const buffer = log.toBuffer();
    const parsed = LogResult.fromBuffer(buffer);

    expect(parsed.equals(log)).toBe(true);
  });

  it('round-trips through toBuffer/fromBuffer with effects', () => {
    const log = LogResult.random(true);
    expect(log.noteHashes).toBeDefined();
    expect(log.nullifiers).toBeDefined();

    const buffer = log.toBuffer();
    const parsed = LogResult.fromBuffer(buffer);

    expect(parsed.equals(log)).toBe(true);
    expect(parsed.noteHashes).toEqual(log.noteHashes);
    expect(parsed.nullifiers).toEqual(log.nullifiers);
  });

  it('round-trips through the zod schema without effects', () => {
    const log = LogResult.random(false);
    const parsed = LogResult.schema.parse(JSON.parse(jsonStringify(log)));
    expect(parsed.equals(log)).toBe(true);
    expect(parsed.noteHashes).toBeUndefined();
    expect(parsed.nullifiers).toBeUndefined();
  });

  it('round-trips through the zod schema with effects', () => {
    const log = LogResult.random(true);
    const parsed = LogResult.schema.parse(JSON.parse(jsonStringify(log)));
    expect(parsed.equals(log)).toBe(true);
    expect(parsed.noteHashes).toEqual(log.noteHashes);
    expect(parsed.nullifiers).toEqual(log.nullifiers);
  });

  it('toHumanReadable includes effect fields only when present', () => {
    const without = LogResult.random(false);
    expect(without.toHumanReadable()).not.toContain('noteHashes');
    expect(without.toHumanReadable()).not.toContain('nullifiers');

    const withEffects = LogResult.random(true);
    expect(withEffects.toHumanReadable()).toContain('noteHashes');
    expect(withEffects.toHumanReadable()).toContain('nullifiers');
  });

  it('equals distinguishes undefined from empty effect arrays', () => {
    const a = LogResult.random(false);
    const b = LogResult.from({ ...a, noteHashes: [], nullifiers: [] });
    expect(a.equals(b)).toBe(false);
  });
});
