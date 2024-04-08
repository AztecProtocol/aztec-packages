import { BarretenbergSync } from './index.js';
import { Timer } from '../benchmark/timer.js';
import { RawBuffer } from '../types/index.js';
import { randomBytes } from '../random/index.js';
import { createHash } from 'crypto';

describe('sha256 sync', () => {
  let api: BarretenbergSync;

  beforeAll(async () => {
    api = await BarretenbergSync.new();
  });

  it('sha256', () => {
    const data = randomBytes(67);
    const expected = createHash('sha256').update(data).digest();
    const result = Buffer.from(api.sha256Hash(new RawBuffer(data), data.length).toBuffer());
    expect(result).toEqual(expected);
  });

  it('sha256 perf test', () => {
    const loops = 1024;
    const data = randomBytes(67);

    const t1 = new Timer();
    for (let i = 0; i < loops; ++i) {
      createHash('sha256').update(data).digest();
    }
    const jsMs = t1.ms();

    const t2 = new Timer();
    for (let i = 0; i < loops; ++i) {
      api.sha256Hash(new RawBuffer(data), data.length);
    }
    const wasmMs = t2.ms();

    console.log(
      `Executed ${loops} hashes at an average ${wasmMs.toFixed(2)}ms / hash. (${((wasmMs / jsMs) * 100).toFixed(
        2,
      )}% faster than js.)`,
    );
  });
});
