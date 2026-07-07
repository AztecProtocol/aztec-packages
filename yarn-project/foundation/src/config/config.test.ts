import { jest } from '@jest/globals';

import {
  type ConfigMappingsType,
  bigintConfigHelper,
  floatConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
  optionalNumberConfigHelper,
  percentageConfigHelper,
} from './index.js';

describe('Config', () => {
  describe('getConfigFromMappings', () => {
    describe('deprecatedFallback', () => {
      const originalEnv = process.env;

      beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
        // Clean up env vars we'll use in tests
        delete process.env.L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI;
        delete process.env.L1_FIXED_PRIORITY_FEE_PER_GAS;
        delete process.env.L1_FIXED_PRIORITY_FEE_PER_GAS_GWEI;
      });

      afterEach(() => {
        process.env = originalEnv;
      });

      interface TestConfig {
        minimumPriorityFeePerGas: number;
      }

      it('logs deprecation warning when deprecated env var is used', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        const value = '33';

        process.env.L1_FIXED_PRIORITY_FEE_PER_GAS = value;

        const configMappings: ConfigMappingsType<TestConfig> = {
          minimumPriorityFeePerGas: {
            description: 'Minimum priority fee per gas in Gwei',
            env: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
            fallback: ['L1_FIXED_PRIORITY_FEE_PER_GAS'],
            deprecatedFallback: [
              {
                env: 'L1_FIXED_PRIORITY_FEE_PER_GAS',
                message:
                  'L1_FIXED_PRIORITY_FEE_PER_GAS is deprecated. Please use L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI instead.',
              },
            ],
            ...numberConfigHelper(0),
          },
        };

        const config = getConfigFromMappings(configMappings);

        // Value should still be parsed from the deprecated env var
        expect(config.minimumPriorityFeePerGas).toBe(Number(value));

        // Deprecation warning should have been logged
        expect(consoleSpy).toHaveBeenCalledWith(
          '[DEPRECATED]:',
          'L1_FIXED_PRIORITY_FEE_PER_GAS is deprecated. Please use L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI instead.',
          { deprecatedEnvVar: 'L1_FIXED_PRIORITY_FEE_PER_GAS', newEnvVar: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI' },
        );

        consoleSpy.mockRestore();
      });

      it('does not log deprecation warning when new env var is used', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        const value = '33';

        process.env.L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI = value;

        const configMappings: ConfigMappingsType<TestConfig> = {
          minimumPriorityFeePerGas: {
            description: 'Minimum priority fee per gas in Gwei',
            env: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
            fallback: ['L1_FIXED_PRIORITY_FEE_PER_GAS'],
            deprecatedFallback: [
              {
                env: 'L1_FIXED_PRIORITY_FEE_PER_GAS',
                message:
                  'L1_FIXED_PRIORITY_FEE_PER_GAS is deprecated. Please use L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI instead.',
              },
            ],
            ...numberConfigHelper(0),
          },
        };

        const config = getConfigFromMappings(configMappings);

        expect(config.minimumPriorityFeePerGas).toBe(Number(value));

        // No deprecation warning should be logged
        expect(consoleSpy).not.toHaveBeenCalled();

        consoleSpy.mockRestore();
      });

      it('uses default deprecation message when custom message is not provided', () => {
        const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

        const value = '100';

        process.env.L1_FIXED_PRIORITY_FEE_PER_GAS_GWEI = value;

        const configMappings: ConfigMappingsType<TestConfig> = {
          minimumPriorityFeePerGas: {
            description: 'Minimum priority fee per gas in Gwei',
            env: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
            fallback: ['L1_FIXED_PRIORITY_FEE_PER_GAS_GWEI'],
            deprecatedFallback: [
              {
                env: 'L1_FIXED_PRIORITY_FEE_PER_GAS_GWEI',
                // No custom message provided
              },
            ],
            ...numberConfigHelper(0),
          },
        };

        const config = getConfigFromMappings(configMappings);

        expect(config.minimumPriorityFeePerGas).toBe(Number(value));

        // Default deprecation message should be logged
        expect(consoleSpy).toHaveBeenCalledWith(
          '[DEPRECATED]:',
          'Environment variable L1_FIXED_PRIORITY_FEE_PER_GAS_GWEI is deprecated. Please use L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI instead.',
          { deprecatedEnvVar: 'L1_FIXED_PRIORITY_FEE_PER_GAS_GWEI', newEnvVar: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI' },
        );

        consoleSpy.mockRestore();
      });
    });
  });

  describe('numberConfigHelper', () => {
    it('parses integer strings', () => {
      const { parseEnv } = numberConfigHelper(5);
      expect(parseEnv!('42')).toBe(42);
      expect(parseEnv!('0')).toBe(0);
      expect(parseEnv!('-7')).toBe(-7);
    });

    it('throws for non-numeric input instead of falling back to the default', () => {
      const { parseEnv } = numberConfigHelper(5);
      expect(() => parseEnv!('not-a-number')).toThrow();
    });

    it('throws instead of silently truncating a decimal value', () => {
      const { parseEnv } = numberConfigHelper(5);
      expect(() => parseEnv!('0.8')).toThrow();
      expect(() => parseEnv!('3.14')).toThrow();
    });

    it('throws for values that are not safe integers', () => {
      const { parseEnv } = numberConfigHelper(5);
      expect(() => parseEnv!('1e30')).toThrow();
      expect(() => parseEnv!('Infinity')).toThrow();
    });

    it('applies the default only when the env var is unset, not when it is invalid', () => {
      const originalEnv = process.env;
      const envVar = 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI';
      try {
        interface TestConfig {
          value: number;
        }
        const mappings: ConfigMappingsType<TestConfig> = {
          value: { env: envVar, description: 'test', ...numberConfigHelper(5) },
        };

        // Unset -> default
        process.env = { ...originalEnv };
        delete process.env[envVar];
        expect(getConfigFromMappings(mappings).value).toBe(5);

        // Empty -> default
        process.env = { ...originalEnv, [envVar]: '' };
        expect(getConfigFromMappings(mappings).value).toBe(5);

        // Set but invalid -> throws
        process.env = { ...originalEnv, [envVar]: 'not-a-number' };
        expect(() => getConfigFromMappings(mappings)).toThrow();
      } finally {
        process.env = originalEnv;
      }
    });
  });

  describe('floatConfigHelper', () => {
    it('parses floating-point strings', () => {
      const { parseEnv } = floatConfigHelper(1.5);
      expect(parseEnv!('0.8')).toBe(0.8);
      expect(parseEnv!('42')).toBe(42);
      expect(parseEnv!('-2.5')).toBe(-2.5);
    });

    it('throws for invalid input instead of falling back to the default', () => {
      const { parseEnv } = floatConfigHelper(1.5);
      expect(() => parseEnv!('not-a-number')).toThrow();
      expect(() => parseEnv!('Infinity')).toThrow();
    });

    it('runs the validation function on the parsed value', () => {
      const { parseEnv } = floatConfigHelper(1.5, val => {
        if (val < 0) {
          throw new Error('must be non-negative');
        }
      });
      expect(parseEnv!('2.5')).toBe(2.5);
      expect(() => parseEnv!('-1')).toThrow('must be non-negative');
    });
  });

  describe('percentageConfigHelper', () => {
    it('parses 0-1 values', () => {
      const { parseEnv } = percentageConfigHelper(0.5);
      expect(parseEnv!('0.25')).toBe(0.25);
      expect(parseEnv!('0')).toBe(0);
      expect(parseEnv!('1')).toBe(1);
    });

    it('throws for out-of-range values', () => {
      const { parseEnv } = percentageConfigHelper(0.5);
      expect(() => parseEnv!('1.5')).toThrow();
      expect(() => parseEnv!('-0.1')).toThrow();
    });

    it('throws for invalid input instead of falling back to the default', () => {
      const { parseEnv } = percentageConfigHelper(0.5);
      expect(() => parseEnv!('not-a-number')).toThrow();
    });
  });

  describe('optionalNumberConfigHelper', () => {
    it('parses integer strings', () => {
      const { parseEnv } = optionalNumberConfigHelper();
      expect(parseEnv!('42')).toBe(42);
      expect(parseEnv!('0')).toBe(0);
    });

    it('throws instead of silently truncating a decimal value', () => {
      const { parseEnv } = optionalNumberConfigHelper();
      expect(() => parseEnv!('0.5')).toThrow();
      expect(() => parseEnv!('3.14')).toThrow();
    });

    it('throws for non-numeric input', () => {
      const { parseEnv } = optionalNumberConfigHelper();
      expect(() => parseEnv!('not-a-number')).toThrow();
    });
  });

  describe('bigintConfigHelper', () => {
    it('parses plain integer strings', () => {
      const { parseEnv } = bigintConfigHelper();
      expect(parseEnv!('123')).toBe(123n);
      expect(parseEnv!('0')).toBe(0n);
      expect(parseEnv!('200000000000000000000000')).toBe(200000000000000000000000n);
    });

    it('parses scientific notation', () => {
      const { parseEnv } = bigintConfigHelper();
      expect(parseEnv!('1e+23')).toBe(100000000000000000000000n);
      expect(parseEnv!('2E+23')).toBe(200000000000000000000000n);
      expect(parseEnv!('1e23')).toBe(100000000000000000000000n);
      expect(parseEnv!('5e18')).toBe(5000000000000000000n);
    });

    it('parses scientific notation with decimal mantissa', () => {
      const { parseEnv } = bigintConfigHelper();
      expect(parseEnv!('1.5e10')).toBe(15000000000n);
      expect(parseEnv!('2.5e5')).toBe(250000n);
    });

    it('throws for non-integer scientific notation results', () => {
      const { parseEnv } = bigintConfigHelper();
      expect(() => parseEnv!('1e-3')).toThrow();
    });

    it('returns default value for empty string env var', () => {
      const originalEnv = process.env;
      process.env = { ...originalEnv, L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI: '' };
      try {
        interface TestConfig {
          value: bigint;
        }
        const config = getConfigFromMappings<TestConfig>({
          value: {
            env: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
            description: 'test',
            parseEnv: () => {
              throw new Error('parseEnv should not be called for empty string');
            },
            defaultValue: 42n,
          },
        });
        expect(config.value).toBe(42n);
      } finally {
        process.env = originalEnv;
      }
    });
  });
});
