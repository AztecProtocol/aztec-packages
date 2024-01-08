import { createHash, randomBytes } from 'crypto';

import { toBigIntBE } from '../../bigint-buffer/index.js';
import { Fr } from '../../fields/fields.js';
import { sha256, sha256ToField } from './index.js';

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

    const unModulated = toBigIntBE(shaBytes) + Fr.MODULUS;

    // const expected = Fr.fromBufferReduce(shaBytes);

    const result = sha256ToField(data);
    expect(result.toBigInt()).toEqual(unModulated % Fr.MODULUS); //expected);
  });
});
