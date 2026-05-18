import { jest } from '@jest/globals';

import {
  ConfigLayerName,
  type ConfigMappingsType,
  booleanConfigHelper,
  composeConfigMappings,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
  pickConfigMappings,
  resolveConfig,
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

  describe('resolveConfig', () => {
    interface ResolveConfigFixture {
      port: number;
      enabled: boolean;
      networkName: string;
      requiredToken: string;
    }

    const mappings: ConfigMappingsType<ResolveConfigFixture> = {
      port: {
        description: 'Port',
        env: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
        ...numberConfigHelper(8080),
      },
      enabled: {
        description: 'Enabled',
        ...booleanConfigHelper(false),
      },
      networkName: {
        description: 'Network name',
        defaultValue: 'alpha',
      },
      requiredToken: {
        description: 'Required token',
      },
    };

    it('resolves values by layer priority and keeps provenance for each key', () => {
      const resolved = resolveConfig(mappings, [
        {
          name: ConfigLayerName.ENV,
          values: {
            port: 5050,
            enabled: true,
            requiredToken: 'env-token',
          },
        },
        {
          name: ConfigLayerName.NETWORK,
          values: {
            port: 6060,
            networkName: 'mainnet',
          },
        },
        {
          name: ConfigLayerName.CLI,
          values: {
            port: 4040,
          },
        },
      ]);

      expect(resolved.port).toEqual({
        value: 4040,
        source: ConfigLayerName.CLI,
        envVar: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
        layers: [
          { layer: ConfigLayerName.CLI, value: 4040 },
          { layer: ConfigLayerName.ENV, value: 5050 },
          { layer: ConfigLayerName.NETWORK, value: 6060 },
          { layer: ConfigLayerName.DEFAULT, value: 8080 },
        ],
      });
      expect(resolved.enabled).toEqual({
        value: true,
        source: ConfigLayerName.ENV,
        envVar: undefined,
        layers: [
          { layer: ConfigLayerName.ENV, value: true },
          { layer: ConfigLayerName.DEFAULT, value: false },
        ],
      });
      expect(resolved.networkName).toEqual({
        value: 'mainnet',
        source: ConfigLayerName.NETWORK,
        envVar: undefined,
        layers: [
          { layer: ConfigLayerName.NETWORK, value: 'mainnet' },
          { layer: ConfigLayerName.DEFAULT, value: 'alpha' },
        ],
      });
      expect(resolved.requiredToken).toEqual({
        value: 'env-token',
        source: ConfigLayerName.ENV,
        envVar: undefined,
        layers: [{ layer: ConfigLayerName.ENV, value: 'env-token' }],
      });
    });

    it('throws if a required key has no value in any layer and no default', () => {
      expect(() =>
        resolveConfig(mappings, [
          {
            name: ConfigLayerName.ENV,
            values: {
              port: 5050,
            },
          },
        ]),
      ).toThrow("Missing required config 'requiredToken'");
    });

    it('does not call parseEnv while resolving already-typed layer values', () => {
      const parseEnv = jest.fn((_val: string) => 999);
      const typedMappings: ConfigMappingsType<{ safeInteger: number }> = {
        safeInteger: {
          description: 'Safe integer',
          parseEnv,
          defaultValue: 1,
        },
      };

      const resolved = resolveConfig(typedMappings, [
        {
          name: ConfigLayerName.ENV,
          values: {
            safeInteger: 42,
          },
        },
      ]);

      expect(resolved.safeInteger.value).toBe(42);
      expect(resolved.safeInteger.layers).toEqual([
        { layer: ConfigLayerName.ENV, value: 42 },
        { layer: ConfigLayerName.DEFAULT, value: 1 },
      ]);
      expect(parseEnv).not.toHaveBeenCalled();
    });

    it('throws when the same layer is provided more than once', () => {
      expect(() =>
        resolveConfig(mappings, [
          { name: ConfigLayerName.ENV, values: { requiredToken: 'one' } },
          { name: ConfigLayerName.ENV, values: { requiredToken: 'two' } },
        ]),
      ).toThrow("Duplicate config layer 'env' in resolveConfig input");
    });
  });

  describe('composeConfigMappings', () => {
    interface LeftConfig {
      left: number;
    }

    interface RightConfig {
      right: number;
    }

    interface FishermanModeConfig {
      fishermanMode: boolean;
    }

    interface SequencerOnlyConfig {
      sequencerOnly: number;
    }

    interface PublisherOnlyConfig {
      publisherOnly: number;
    }

    type SequencerConfig = FishermanModeConfig & SequencerOnlyConfig;
    type PublisherConfig = FishermanModeConfig & PublisherOnlyConfig;
    type NodeConfig = SequencerConfig & PublisherConfig;

    it('merges disjoint mapping objects', () => {
      const leftMappings: ConfigMappingsType<LeftConfig> = {
        left: {
          description: 'left mapping',
          ...numberConfigHelper(1),
        },
      };
      const rightMappings: ConfigMappingsType<RightConfig> = {
        right: {
          description: 'right mapping',
          ...numberConfigHelper(2),
        },
      };

      const composed = composeConfigMappings(leftMappings, rightMappings);

      expect(Object.keys(composed)).toEqual(['left', 'right']);
      expect(getDefaultConfig(composed)).toEqual({ left: 1, right: 2 });
    });

    it('deduplicates duplicate property keys that reuse the same mapping object', () => {
      const fishermanModeConfigMappings: ConfigMappingsType<FishermanModeConfig> = {
        fishermanMode: {
          description: 'Run in fisherman mode',
          ...booleanConfigHelper(false),
        },
      };
      const sequencerOnlyConfigMappings: ConfigMappingsType<SequencerOnlyConfig> = {
        sequencerOnly: {
          description: 'sequencer only mapping',
          ...numberConfigHelper(4),
        },
      };
      const publisherOnlyConfigMappings: ConfigMappingsType<PublisherOnlyConfig> = {
        publisherOnly: {
          description: 'publisher only mapping',
          ...numberConfigHelper(5),
        },
      };
      const sequencerConfigMappings: ConfigMappingsType<SequencerConfig> = composeConfigMappings(
        fishermanModeConfigMappings,
        sequencerOnlyConfigMappings,
      );
      const publisherConfigMappings: ConfigMappingsType<PublisherConfig> = composeConfigMappings(
        fishermanModeConfigMappings,
        publisherOnlyConfigMappings,
      );

      const nodeConfigMappings: ConfigMappingsType<NodeConfig> = composeConfigMappings(
        sequencerConfigMappings,
        publisherConfigMappings,
      );

      expect(Object.keys(nodeConfigMappings)).toEqual(['fishermanMode', 'sequencerOnly', 'publisherOnly']);
      expect(getDefaultConfig(nodeConfigMappings)).toEqual({
        fishermanMode: false,
        sequencerOnly: 4,
        publisherOnly: 5,
      });
    });

    it('deduplicates the same shared mapping composed across three components into one aggregate', () => {
      const sharedConfigMappings: ConfigMappingsType<FishermanModeConfig> = {
        fishermanMode: {
          description: 'Run in fisherman mode',
          ...booleanConfigHelper(false),
        },
      };
      const aOnlyConfigMappings: ConfigMappingsType<SequencerOnlyConfig> = {
        sequencerOnly: { description: 'a', ...numberConfigHelper(1) },
      };
      const bOnlyConfigMappings: ConfigMappingsType<PublisherOnlyConfig> = {
        publisherOnly: { description: 'b', ...numberConfigHelper(2) },
      };
      interface COnlyConfig {
        cOnly: number;
      }
      const cOnlyConfigMappings: ConfigMappingsType<COnlyConfig> = {
        cOnly: { description: 'c', ...numberConfigHelper(3) },
      };

      const aMappings = composeConfigMappings(sharedConfigMappings, aOnlyConfigMappings);
      const bMappings = composeConfigMappings(sharedConfigMappings, bOnlyConfigMappings);
      const cMappings = composeConfigMappings(sharedConfigMappings, cOnlyConfigMappings);

      type AggregateConfig = FishermanModeConfig & SequencerOnlyConfig & PublisherOnlyConfig & COnlyConfig;
      const aggregateMappings: ConfigMappingsType<AggregateConfig> = composeConfigMappings(
        aMappings,
        bMappings,
        cMappings,
      );

      expect(Object.keys(aggregateMappings)).toEqual(['fishermanMode', 'sequencerOnly', 'publisherOnly', 'cOnly']);
      expect(getDefaultConfig(aggregateMappings)).toEqual({
        fishermanMode: false,
        sequencerOnly: 1,
        publisherOnly: 2,
        cOnly: 3,
      });
    });

    it('works with pickConfigMappings', () => {
      interface ChainConfig {
        l1ChainId: number;
        rollupVersion: number;
      }
      interface ValidatorOnlyConfig {
        validatorOnly: number;
      }
      const chainConfigMappings: ConfigMappingsType<ChainConfig> = {
        l1ChainId: { description: 'l1 chain id', ...numberConfigHelper(31337) },
        rollupVersion: { description: 'rollup version', ...numberConfigHelper(1) },
      };
      const validatorOnlyConfigMappings: ConfigMappingsType<ValidatorOnlyConfig> = {
        validatorOnly: { description: 'validator only', ...numberConfigHelper(7) },
      };
      const validatorMappings = composeConfigMappings(
        pickConfigMappings(chainConfigMappings, ['l1ChainId']),
        validatorOnlyConfigMappings,
      );

      const composed = composeConfigMappings(validatorMappings, chainConfigMappings);

      expect(Object.keys(composed)).toEqual(['l1ChainId', 'validatorOnly', 'rollupVersion']);
      expect(getDefaultConfig(composed)).toEqual({ l1ChainId: 31337, validatorOnly: 7, rollupVersion: 1 });
    });

    it('throws on duplicate property keys with different mapping objects even if definitions are equivalent', () => {
      const mappingsA = {
        duplicate: {
          description: 'duplicate mapping',
          ...numberConfigHelper(3),
        },
      };
      const mappingsB = {
        duplicate: {
          description: 'duplicate mapping',
          ...numberConfigHelper(3),
        },
      };

      expect(() => composeConfigMappings(mappingsA, mappingsB)).toThrow(
        "Duplicate config mapping key 'duplicate' with a different mapping object while composing config mappings.",
      );
    });
  });

  describe('bigintConfigHelper', () => {
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
