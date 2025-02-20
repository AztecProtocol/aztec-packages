import { parseSignedInt } from './utils.js';

describe('parse signed int', () => {
  it('i8', () => {
    let buf = Buffer.from('ff', 'hex');
    expect(parseSignedInt(buf)).toBe(-1n);

    // max positive value
    buf = Buffer.from('7f', 'hex');
    expect(parseSignedInt(buf)).toBe(2n ** 7n - 1n);
  });

  it('i16', () => {
    let buf = Buffer.from('ffff', 'hex');
    expect(parseSignedInt(buf)).toBe(-1n);

    // max positive value
    buf = Buffer.from('7fff', 'hex');
    expect(parseSignedInt(buf)).toBe(2n ** 15n - 1n);
  });

  it('i32', () => {
    let buf = Buffer.from('ffffffff', 'hex');
    expect(parseSignedInt(buf)).toBe(-1n);

    // max positive value
    buf = Buffer.from('7fffffff', 'hex');
    expect(parseSignedInt(buf)).toBe(2n ** 31n - 1n);
  });

  it('i64', () => {
    let buf = Buffer.from('ffffffffffffffff', 'hex');
    expect(parseSignedInt(buf)).toBe(-1n);

    // max positive value
    buf = Buffer.from('7fffffffffffffff', 'hex');
    expect(parseSignedInt(buf)).toBe(2n ** 63n - 1n);
  });
});
