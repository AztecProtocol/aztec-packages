import { trimmedBytesLength } from './utils.js';

describe('trimmedBytesLength', () => {
  it('returns 0 for an empty buffer', () => {
    expect(trimmedBytesLength(new Uint8Array([]))).toBe(0);
  });

  it('returns 0 for an all-zeros buffer', () => {
    expect(trimmedBytesLength(new Uint8Array([0, 0, 0, 0]))).toBe(0);
  });

  it('returns full length when there are no trailing zeros', () => {
    expect(trimmedBytesLength(new Uint8Array([1, 2, 3]))).toBe(3);
  });

  it('excludes trailing zeros', () => {
    expect(trimmedBytesLength(new Uint8Array([1, 2, 0, 0]))).toBe(2);
  });

  it('preserves leading zeros', () => {
    expect(trimmedBytesLength(new Uint8Array([0, 0, 1, 0, 0]))).toBe(3);
  });

  it('preserves interior zeros', () => {
    expect(trimmedBytesLength(new Uint8Array([1, 0, 0, 2, 0]))).toBe(4);
  });

  it('handles a single non-zero byte', () => {
    expect(trimmedBytesLength(new Uint8Array([0, 0, 5]))).toBe(3);
  });

  it('handles a single zero byte', () => {
    expect(trimmedBytesLength(new Uint8Array([0]))).toBe(0);
  });
});
