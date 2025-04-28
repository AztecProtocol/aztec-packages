import { urlJoin } from './index.js';

describe('string', () => {
  describe('urlJoin', () => {
    it('joins url fragments', () => {
      expect(urlJoin('http://example.com', 'foo', 'bar')).toBe('http://example.com/foo/bar');
    });

    it('removes duplicate slashes', () => {
      expect(urlJoin('http://example.com/', '/foo/', '/bar/')).toBe('http://example.com/foo/bar');
    });
  });
});
