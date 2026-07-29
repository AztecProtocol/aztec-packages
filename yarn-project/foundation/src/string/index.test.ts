import { formatSeconds, urlJoin, withHexPrefix, withoutHexPrefix } from './index.js';

describe('string', () => {
  describe('urlJoin', () => {
    it('joins url fragments', () => {
      expect(urlJoin('http://example.com', 'foo', 'bar')).toBe('http://example.com/foo/bar');
    });

    it.each([
      [['http://example.com/', '/foo/', '/bar/'], 'http://example.com/foo/bar'],
      [['http://example.com/', '', '//', '///', '////foo//', '//bar////', 'baz'], 'http://example.com/foo/bar/baz'],
    ])('removes duplicate slashes', (parts, url) => {
      expect(urlJoin(...parts)).toBe(url);
    });

    it.each([
      [['http://example.com', 'a'], 'http://example.com/a'],
      [['http://example.com', 'a', 'b'], 'http://example.com/a/b'],
      [['x', 'y', 'z'], 'x/y/z'],
      [['http://example.com', '/a/'], 'http://example.com/a'],
    ])('preserves single-character path segments %#', (parts, url) => {
      expect(urlJoin(...parts)).toBe(url);
    });
  });

  describe('formatSeconds', () => {
    it.each([
      [0, '0s'],
      [45, '45s'],
      [59, '59s'],
      [60, '1m'],
      [90, '2m'],
      [3540, '59m'],
      [3600, '1h'],
      [3660, '1h 1m'],
      [7500, '2h 5m'],
    ])('formats %d seconds as %s', (seconds, expected) => {
      expect(formatSeconds(seconds)).toBe(expected);
    });
  });

  describe('hex prefix helpers', () => {
    it('adds 0x prefix when missing', () => {
      expect(withHexPrefix('abc')).toBe('0xabc');
    });

    it('does not duplicate 0x prefix', () => {
      expect(withHexPrefix('0xabc')).toBe('0xabc');
    });

    it('removes 0x prefix when present', () => {
      expect(withoutHexPrefix('0xdeadbeef')).toBe('deadbeef');
    });

    it('leaves string unchanged without prefix', () => {
      expect(withoutHexPrefix('deadbeef')).toBe('deadbeef');
    });
  });
});
