import { createHash, randomBytes, randomInt } from 'crypto';

import { sha256, sha256Compression } from './index.js';

describe('sha256', () => {
  describe('sha256 hash', () => {
    it('should correctly hash data using hash.js', () => {
      const data = randomBytes(67);

      const expected = createHash('sha256').update(data).digest();

      const result = sha256(data);
      expect(result).toEqual(expected);
    });
  });

  describe('sha256 compression', () => {
    it('sha256Compression works', () => {
      const state = Uint32Array.from(Array.from({ length: 8 }, () => randomInt(2 ** 32)));
      const inputs = Uint32Array.from(Array.from({ length: 16 }, () => randomInt(2 ** 32)));

      const output = sha256Compression(state, inputs);
      expect(output.length).toEqual(8);
    });
    it('sha256 compression does not work on state.length < 8', () => {
      const state = Uint32Array.from(Array.from({ length: 7 }, () => randomInt(2 ** 32)));
      const inputs = Uint32Array.from(Array.from({ length: 16 }, () => randomInt(2 ** 32)));
      expect(() => sha256Compression(state, inputs)).toThrow();
    });
    it('sha256 compression does not work on state.length > 8', () => {
      const state = Uint32Array.from(Array.from({ length: 9 }, () => randomInt(2 ** 32)));
      const inputs = Uint32Array.from(Array.from({ length: 16 }, () => randomInt(2 ** 32)));
      expect(() => sha256Compression(state, inputs)).toThrow();
    });
    it('sha256 compression does not work on inputs.length < 16', () => {
      const state = Uint32Array.from(Array.from({ length: 8 }, () => randomInt(2 ** 32)));
      const inputs = Uint32Array.from(Array.from({ length: 15 }, () => randomInt(2 ** 32)));
      expect(() => sha256Compression(state, inputs)).toThrow();
    });
    it('sha256 compression does not work on inputs.length > 16', () => {
      const state = Uint32Array.from(Array.from({ length: 8 }, () => randomInt(2 ** 32)));
      const inputs = Uint32Array.from(Array.from({ length: 17 }, () => randomInt(2 ** 32)));
      expect(() => sha256Compression(state, inputs)).toThrow();
    });
  });
});
