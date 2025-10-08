import { urlJoin, withHexPrefix, withoutHexPrefix } from './index.js';

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
