import { createHash, randomBytes } from 'crypto';

import { toBigIntBE } from '../../bigint-buffer/index.js';
import { sha256, sha256TruncateToField } from './index.js';

describe('sha256', () => {
  it('should correctly hash data using hash.js', () => {
    const data = randomBytes(67);

    const expected = createHash('sha256').update(data).digest();

    const result = sha256(data);
    expect(result).toEqual(expected);
  });
});

describe('sha256ToField', () => {
  it('should correctly hash data using hash.js', () => {
    const data = randomBytes(67);
    const shaBytes = sha256(data);

    expect(shaBytes.byteLength).toEqual(32);

    const bitShifted = toBigIntBE(shaBytes) >> 8n;

    const result = sha256TruncateToField(data);
    expect(result.toBigInt()).toEqual(bitShifted);
  });
});
