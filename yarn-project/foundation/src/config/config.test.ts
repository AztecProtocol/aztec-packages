import { jest } from '@jest/globals';

import { type ConfigMappingsType, bigintConfigHelper, getConfigFromMappings, numberConfigHelper } from './index.js';

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

      it('reads from explicit env source when provided, falling back to default when key absent', () => {
        interface TestConfig {
          minimumPriorityFeePerGas: number;
        }
        const configMappings: ConfigMappingsType<TestConfig> = {
          minimumPriorityFeePerGas: {
            env: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
            description: 'fee',
            ...numberConfigHelper(7),
          },
        };
        // process.env has the key but our override does not — override wins and yields default
        process.env.L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI = '123';
        const fromProcessEnv = getConfigFromMappings(configMappings);
        expect(fromProcessEnv.minimumPriorityFeePerGas).toBe(123);

        const fromExplicitEnv = getConfigFromMappings(configMappings, {});
        expect(fromExplicitEnv.minimumPriorityFeePerGas).toBe(7);

        const withOverride = getConfigFromMappings(configMappings, { L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI: '42' });
        expect(withOverride.minimumPriorityFeePerGas).toBe(42);
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
