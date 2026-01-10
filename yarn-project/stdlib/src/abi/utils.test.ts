import { bufferFrom } from '@aztec/foundation/buffer';

import { parseSignedInt } from './utils.js';

describe('parse signed int', () => {
  it('i8', () => {
    let buf = bufferFrom('ff', 'hex');
    expect(parseSignedInt(buf)).toBe(-1n);

    // max positive value
    buf = bufferFrom('7f', 'hex');
    expect(parseSignedInt(buf)).toBe(2n ** 7n - 1n);
  });

  it('i16', () => {
    let buf = bufferFrom('ffff', 'hex');
    expect(parseSignedInt(buf)).toBe(-1n);

    // max positive value
    buf = bufferFrom('7fff', 'hex');
    expect(parseSignedInt(buf)).toBe(2n ** 15n - 1n);
  });

  it('i32', () => {
    let buf = bufferFrom('ffffffff', 'hex');
    expect(parseSignedInt(buf)).toBe(-1n);

    // max positive value
    buf = bufferFrom('7fffffff', 'hex');
    expect(parseSignedInt(buf)).toBe(2n ** 31n - 1n);
  });

  it('i64', () => {
    let buf = bufferFrom('ffffffffffffffff', 'hex');
    expect(parseSignedInt(buf)).toBe(-1n);

    // max positive value
    buf = bufferFrom('7fffffffffffffff', 'hex');
    expect(parseSignedInt(buf)).toBe(2n ** 63n - 1n);
  });
});
