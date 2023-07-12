import { toBufferBE } from '../bigint-buffer/index.js';
import { BigField } from './big_field.js';
import { Fr } from './fields.js';

const MAX_256_VALUE = 2n ** 256n - 1n;

describe('BigField', () => {
  it('stores 256 bits in fields', () => {
    const max256Value = toBufferBE(MAX_256_VALUE, 32);
    const bigField = BigField.fromBuffer(max256Value);
    // this returns a buffer containing the bit pattern split across 2 fields
    expect(bigField.toFieldsBuffer()).toEqual(
      Buffer.concat([Buffer.alloc(1, 0), Buffer.alloc(31, 0xff), Buffer.alloc(31, 0), Buffer.alloc(1, 0xff)]),
    );
    // this returns the value in a single 32 byte buffer
    expect(bigField.toBuffer()).toEqual(max256Value);

    // this returns the value as a big int
    expect(bigField.toBigInt()).toBe(MAX_256_VALUE);
  });

  it('can be constructed from a field', () => {
    const field = Fr.random();
    const bigField = BigField.fromField(field);
    expect(bigField.toBuffer()).toEqual(field.toBuffer());
  });
});
