import {
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
} from '@aztec/constants';

import { readFileSync } from 'fs';
import { createRequire } from 'module';

describe('shipped private kernel reset catalog', () => {
  type ShippedEntry = { name: string; dimensions: number[]; cost: number };
  type ShippedConfig = {
    inner: ShippedEntry[];
    finalTail: ShippedEntry[];
    finalTailToPublic: ShippedEntry[];
  };
  const configPath = createRequire(import.meta.url).resolve(
    '@aztec/protocol-circuits-artifacts/private_kernel_reset_config.json',
  );
  const shipped = JSON.parse(readFileSync(configPath, 'utf8')) as ShippedConfig;
  const allEntries: ShippedEntry[] = [...shipped.inner, ...shipped.finalTail, ...shipped.finalTailToPublic];
  const allowed = new Set([0, 1, 2, 4, 8, 16, 32, 64]);

  it('every dimension value is a power of 2 in {0,1,2,4,8,16,32,64}', () => {
    const offenders = allEntries
      .flatMap(e => e.dimensions.map(v => ({ name: e.name, v })))
      .filter(({ v }) => !allowed.has(v));
    expect(offenders).toEqual([]);
  });

  it('inner entries have zero in all three siloing dimensions', () => {
    // Last three slots are NOTE_HASH_SILOING, NULLIFIER_SILOING, PRIVATE_LOG_SILOING.
    const offenders = shipped.inner.filter(e => e.dimensions.slice(6).some(v => v !== 0));
    expect(offenders).toEqual([]);
  });

  it('both final families contain a variant matching protocol maxima as the catch-all', () => {
    const protocolMaxima = [
      MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
      MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
      MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      MAX_KEY_VALIDATION_REQUESTS_PER_TX,
      MAX_NULLIFIERS_PER_TX,
      MAX_NOTE_HASHES_PER_TX,
      MAX_NULLIFIERS_PER_TX,
      MAX_PRIVATE_LOGS_PER_TX,
    ];
    const matches = (e: ShippedEntry) => e.dimensions.every((v, i) => v === protocolMaxima[i]);
    expect(shipped.finalTail.some(matches)).toBe(true);
    expect(shipped.finalTailToPublic.some(matches)).toBe(true);
  });
});
