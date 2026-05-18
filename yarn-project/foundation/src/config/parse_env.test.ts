import { parseBigIntEnv, parseCommaSeparatedTrimmed, parseEnumEnv, parsePercentageEnv } from './parse_env.js';

describe('parse_env', () => {
  it('parseCommaSeparatedTrimmed splits, trims, and drops empty segments', () => {
    expect(parseCommaSeparatedTrimmed(' a ,, b ,  ')).toEqual(['a', 'b']);
  });

  it('parseEnumEnv matches case-insensitively', () => {
    expect(parseEnumEnv(['foo', 'bar'] as const, 'FOO')).toBe('foo');
    expect(() => parseEnumEnv(['foo'], 'baz')).toThrow();
  });

  it('parsePercentageEnv rejects values outside [0, 1]', () => {
    expect(parsePercentageEnv('0.5', 0)).toBe(0.5);
    expect(() => parsePercentageEnv('2', 0)).toThrow();
  });

  describe('parseBigIntEnv', () => {
    it('parses plain integer strings', () => {
      expect(parseBigIntEnv('123')).toBe(123n);
      expect(parseBigIntEnv('0')).toBe(0n);
      expect(parseBigIntEnv('200000000000000000000000')).toBe(200000000000000000000000n);
    });

    it('parses scientific notation', () => {
      expect(parseBigIntEnv('1e+23')).toBe(100000000000000000000000n);
      expect(parseBigIntEnv('2E+23')).toBe(200000000000000000000000n);
      expect(parseBigIntEnv('1e23')).toBe(100000000000000000000000n);
      expect(parseBigIntEnv('5e18')).toBe(5000000000000000000n);
    });

    it('parses scientific notation with decimal mantissa', () => {
      expect(parseBigIntEnv('1.5e10')).toBe(15000000000n);
      expect(parseBigIntEnv('2.5e5')).toBe(250000n);
    });

    it('throws for non-integer scientific notation results', () => {
      expect(() => parseBigIntEnv('1e-3')).toThrow();
    });
  });
});
