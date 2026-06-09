import { jsonStringify } from '@aztec/foundation/json-rpc';

import { LogResultSchema, logResultToHumanReadable, randomLogResult } from './log_result.js';

describe('LogResult', () => {
  it('round-trips through the zod schema without effects', () => {
    const log = randomLogResult(false);
    const parsed = LogResultSchema.parse(JSON.parse(jsonStringify(log)));
    expect(parsed).toEqual(log);
    expect(parsed.noteHashes).toBeUndefined();
    expect(parsed.nullifiers).toBeUndefined();
  });

  it('round-trips through the zod schema with effects', () => {
    const log = randomLogResult(true);
    const parsed = LogResultSchema.parse(JSON.parse(jsonStringify(log)));
    expect(parsed).toEqual(log);
    expect(parsed.noteHashes).toEqual(log.noteHashes);
    expect(parsed.nullifiers).toEqual(log.nullifiers);
  });

  it('logResultToHumanReadable includes effect fields only when present', () => {
    const without = randomLogResult(false);
    expect(logResultToHumanReadable(without)).not.toContain('noteHashes');
    expect(logResultToHumanReadable(without)).not.toContain('nullifiers');

    const withEffects = randomLogResult(true);
    expect(logResultToHumanReadable(withEffects)).toContain('noteHashes');
    expect(logResultToHumanReadable(withEffects)).toContain('nullifiers');
  });
});
