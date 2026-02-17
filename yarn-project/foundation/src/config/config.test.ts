import { jest } from '@jest/globals';

import { type ConfigMappingsType, getConfigFromMappings, numberConfigHelper } from './index.js';

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
});
