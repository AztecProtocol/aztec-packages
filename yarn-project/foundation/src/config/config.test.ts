import { jest } from '@jest/globals';

import {
  ConfigLayerName,
  type ConfigMappingsType,
  booleanConfigHelper,
  cliToTyped,
  composeConfigMappings,
  envToTyped,
  findUniversalConfigKeys,
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

    // TODO(A-1065): once ConfigMapping gains an `optional` flag, restore a throw test for truly
    // required keys. For now, missing keys resolve to { value: undefined }.
    it('resolves to undefined when a key has no value in any layer and no default', () => {
      const resolved = resolveConfig(mappings, [
        {
          name: ConfigLayerName.ENV,
          values: {
            port: 5050,
          },
        },
      ]);
      expect(resolved.requiredToken).toEqual({
        value: undefined,
        source: ConfigLayerName.DEFAULT,
        envVar: undefined,
        layers: [],
      });
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

    it('produces correct merged result and provenance across CLI > ENV > NETWORK > DEFAULT', () => {
      const integrationMappings: ConfigMappingsType<{
        port: number;
        host: string;
        network: string;
        timeout: number;
      }> = {
        port: { description: 'port', ...numberConfigHelper(8080) },
        host: { description: 'host', defaultValue: 'localhost' },
        network: { description: 'network', env: 'NETWORK', defaultValue: 'local' },
        timeout: { description: 'timeout', ...numberConfigHelper(30) },
      };

      const resolved = resolveConfig(integrationMappings, [
        {
          name: ConfigLayerName.CLI,
          values: cliToTyped(integrationMappings, { port: 9000, host: undefined }),
        },
        {
          name: ConfigLayerName.ENV,
          values: envToTyped(integrationMappings, { NETWORK: 'testnet' } as NodeJS.ProcessEnv),
        },
        {
          name: ConfigLayerName.NETWORK,
          values: { timeout: 60 },
        },
      ]);

      expect(resolved.port.value).toBe(9000);
      expect(resolved.port.source).toBe(ConfigLayerName.CLI);

      expect(resolved.network.value).toBe('testnet');
      expect(resolved.network.source).toBe(ConfigLayerName.ENV);

      expect(resolved.timeout.value).toBe(60);
      expect(resolved.timeout.source).toBe(ConfigLayerName.NETWORK);

      expect(resolved.host.value).toBe('localhost');
      expect(resolved.host.source).toBe(ConfigLayerName.DEFAULT);
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

  describe('envToTyped', () => {
    interface EnvFixture {
      port: number;
      network: string;
      enabled: boolean;
    }

    const mappings: ConfigMappingsType<EnvFixture> = {
      port: {
        description: 'aztec port',
        env: 'AZTEC_PORT',
        ...numberConfigHelper(8080),
      },
      network: {
        description: 'aztec network',
        env: 'NETWORK',
        defaultValue: 'default-network',
      },
      enabled: {
        description: 'is enabled',
        ...booleanConfigHelper(false),
      },
    };

    it('emits only keys present in the env source, not defaults', () => {
      const result = envToTyped(mappings, { L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI: '9090' });
      expect(result).toEqual({ port: 9090 });
      expect('network' in result).toBe(false);
      expect('enabled' in result).toBe(false);
    });

    it('runs parseEnv and returns typed values', () => {
      const result = envToTyped(mappings, {
        L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI: '3000',
        NETWORK: 'testnet',
      });
      expect(result.port).toBe(3000);
      expect(typeof result.port).toBe('number');
      expect(result.network).toBe('testnet');
    });

    it('honors fallback env vars', () => {
      interface FallbackFixture {
        fee: number;
      }
      const fallbackMappings: ConfigMappingsType<FallbackFixture> = {
        fee: {
          description: 'fee',
          env: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
          fallback: ['L1_FIXED_PRIORITY_FEE_PER_GAS'],
          ...numberConfigHelper(0),
        },
      };

      const result = envToTyped(fallbackMappings, { L1_FIXED_PRIORITY_FEE_PER_GAS: '42' });
      expect(result.fee).toBe(42);
    });

    it('logs deprecation warnings via the provided env source', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      interface DeprecatedFixture {
        fee: number;
      }
      const deprecatedMappings: ConfigMappingsType<DeprecatedFixture> = {
        fee: {
          description: 'fee',
          env: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
          fallback: ['L1_FIXED_PRIORITY_FEE_PER_GAS'],
          deprecatedFallback: [
            {
              env: 'L1_FIXED_PRIORITY_FEE_PER_GAS',
              message: 'L1_FIXED_PRIORITY_FEE_PER_GAS is deprecated.',
            },
          ],
          ...numberConfigHelper(0),
        },
      };

      envToTyped(deprecatedMappings, { L1_FIXED_PRIORITY_FEE_PER_GAS: '55' });

      expect(consoleSpy).toHaveBeenCalledWith('[DEPRECATED]:', 'L1_FIXED_PRIORITY_FEE_PER_GAS is deprecated.', {
        deprecatedEnvVar: 'L1_FIXED_PRIORITY_FEE_PER_GAS',
        newEnvVar: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
      });
      consoleSpy.mockRestore();
    });

    it('wraps parser errors with key and env name', () => {
      interface ErrorFixture {
        value: number;
      }
      const errorMappings: ConfigMappingsType<ErrorFixture> = {
        value: {
          description: 'value',
          env: 'L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI',
          parseEnv: () => {
            throw new Error('boom');
          },
        },
      };
      expect(() => envToTyped(errorMappings, { L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI: 'bad' })).toThrow(
        "Failed to parse config 'value' (env: L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI): boom",
      );
    });

    it('treats empty string env values as absent', () => {
      const result = envToTyped(mappings, { L1_MINIMUM_PRIORITY_FEE_PER_GAS_GWEI: '' });
      expect('port' in result).toBe(false);
    });

    it('accepts a custom env source without touching process.env', () => {
      const customEnv = { NETWORK: 'custom-network' };
      const result = envToTyped(mappings, customEnv);
      expect(result).toEqual({ name: 'custom-network' });
    });
  });

  describe('cliToTyped', () => {
    interface CliFixture {
      port: number;
      host: string;
      enabled: boolean;
    }

    const mappings: ConfigMappingsType<CliFixture> = {
      port: { description: 'aztec port', ...numberConfigHelper(8080) },
      host: { description: 'network host', defaultValue: 'localhost' },
      enabled: { description: 'is enabled', ...booleanConfigHelper(false) },
    };

    it('emits only keys with defined values', () => {
      const result = cliToTyped(mappings, { port: 9000, host: undefined, enabled: undefined });
      expect(result).toEqual({ port: 9000 });
    });

    it('ignores option keys not present in mappings', () => {
      const result = cliToTyped(mappings, { port: 9000, unknownOption: 'foo' });
      expect(result).toEqual({ port: 9000 });
    });

    it('does not call parseEnv — values are already typed', () => {
      const parseEnv = jest.fn(() => 999);
      const mappingsWithSpy: ConfigMappingsType<{ value: number }> = {
        value: { description: 'value', parseEnv },
      };
      const result = cliToTyped(mappingsWithSpy, { value: 42 });
      expect(result.value).toBe(42);
      expect(parseEnv).not.toHaveBeenCalled();
    });

    it('handles bare keys (no namespace prefix)', () => {
      const result = cliToTyped(mappings, { port: 7070 });
      expect(result.port).toBe(7070);
    });

    it('strips the namespace prefix from dotted keys when no duplicates exist', () => {
      const result = cliToTyped(mappings, { 'api.port': 7070 }, 'api');
      expect(result.port).toBe(7070);
    });

    it('picks the namespace-matching entry when the same mainKey appears under multiple namespaces', () => {
      // e.g. --bot.nodeUrl and --pxe.nodeUrl both reduce to mainKey 'nodeUrl'.
      // Asking for namespace 'bot' should return only the bot value.
      interface NodeUrlConfig {
        nodeUrl: string;
      }
      const nodeUrlMappings: ConfigMappingsType<NodeUrlConfig> = {
        nodeUrl: { description: 'node url' },
      };
      const result = cliToTyped(nodeUrlMappings, { 'bot.nodeUrl': 'http://bot', 'pxe.nodeUrl': 'http://pxe' }, 'bot');
      expect(result.nodeUrl).toBe('http://bot');
    });

    it('skips duplicated mainKeys when no namespace matches', () => {
      interface NodeUrlConfig {
        nodeUrl: string;
      }
      const nodeUrlMappings: ConfigMappingsType<NodeUrlConfig> = {
        nodeUrl: { description: 'node url' },
      };
      const result = cliToTyped(
        nodeUrlMappings,
        { 'bot.nodeUrl': 'http://bot', 'pxe.nodeUrl': 'http://pxe' },
        'archiver',
      );
      expect('nodeUrl' in result).toBe(false);
    });
  });

  describe('findUniversalConfigKeys', () => {
    it('returns empty when fewer than two components are passed', () => {
      expect(findUniversalConfigKeys()).toEqual(new Set());
      const mappings: ConfigMappingsType<{ port: number }> = {
        port: { description: 'port', ...numberConfigHelper(8080) },
      };
      expect(findUniversalConfigKeys(mappings)).toEqual(new Set());
    });

    it('returns keys shared by reference across two components', () => {
      const sharedPortMapping = { description: 'port', ...numberConfigHelper(8080) };
      const componentA: ConfigMappingsType<{ port: number; aOnly: number }> = {
        port: sharedPortMapping,
        aOnly: { description: 'a', ...numberConfigHelper(1) },
      };
      const componentB: ConfigMappingsType<{ port: number; bOnly: number }> = {
        port: sharedPortMapping,
        bOnly: { description: 'b', ...numberConfigHelper(2) },
      };
      expect(findUniversalConfigKeys(componentA, componentB)).toEqual(new Set(['port']));
    });

    it('excludes keys present in only one component', () => {
      const componentA: ConfigMappingsType<{ aOnly: number }> = {
        aOnly: { description: 'a', ...numberConfigHelper(1) },
      };
      const componentB: ConfigMappingsType<{ bOnly: number }> = {
        bOnly: { description: 'b', ...numberConfigHelper(2) },
      };
      expect(findUniversalConfigKeys(componentA, componentB)).toEqual(new Set());
    });

    it('excludes keys whose mapping objects differ between components', () => {
      // Same key name, distinct mapping objects — bot.nodeUrl vs proverNode.nodeUrl scenario.
      const componentA: ConfigMappingsType<{ nodeUrl: string }> = {
        nodeUrl: { description: 'a node url' },
      };
      const componentB: ConfigMappingsType<{ nodeUrl: string }> = {
        nodeUrl: { description: 'b node url' },
      };
      expect(findUniversalConfigKeys(componentA, componentB)).toEqual(new Set());
    });

    it('handles a shared mapping across three components', () => {
      const sharedMapping = { description: 'shared', ...numberConfigHelper(0) };
      const a: ConfigMappingsType<{ shared: number; aOnly: number }> = {
        shared: sharedMapping,
        aOnly: { description: 'a', ...numberConfigHelper(1) },
      };
      const b: ConfigMappingsType<{ shared: number; bOnly: number }> = {
        shared: sharedMapping,
        bOnly: { description: 'b', ...numberConfigHelper(2) },
      };
      const c: ConfigMappingsType<{ shared: number; cOnly: number }> = {
        shared: sharedMapping,
        cOnly: { description: 'c', ...numberConfigHelper(3) },
      };
      expect(findUniversalConfigKeys(a, b, c)).toEqual(new Set(['shared']));
    });

    it('still excludes a key when one component diverges from a shared reference', () => {
      // a, b share by reference; c uses a different mapping object → key is no longer
      // universally promotable because c would need its own registration.
      const sharedMapping = { description: 'shared', ...numberConfigHelper(0) };
      const divergentMapping = { description: 'shared', ...numberConfigHelper(0) };
      const a: ConfigMappingsType<{ shared: number }> = { shared: sharedMapping };
      const b: ConfigMappingsType<{ shared: number }> = { shared: sharedMapping };
      const c: ConfigMappingsType<{ shared: number }> = { shared: divergentMapping };
      expect(findUniversalConfigKeys(a, b, c)).toEqual(new Set());
    });

    it('finds multiple shared keys across the same component pair', () => {
      const portMapping = { description: 'port', ...numberConfigHelper(8080) };
      const hostMapping = { description: 'host', defaultValue: 'localhost' };
      const a: ConfigMappingsType<{ port: number; host: string; aOnly: number }> = {
        port: portMapping,
        host: hostMapping,
        aOnly: { description: 'a', ...numberConfigHelper(1) },
      };
      const b: ConfigMappingsType<{ port: number; host: string; bOnly: number }> = {
        port: portMapping,
        host: hostMapping,
        bOnly: { description: 'b', ...numberConfigHelper(2) },
      };
      expect(findUniversalConfigKeys(a, b)).toEqual(new Set(['port', 'host']));
    });

    it('works with composeConfigMappings output as input', () => {
      // Real-world usage: each component is itself composed of multiple sub-mappings.
      const blobMapping = { description: 'blob', ...numberConfigHelper(0) };
      const sharedBlobMappings = { blobUrl: blobMapping };
      const archiverComposed = composeConfigMappings(sharedBlobMappings, {
        archiverOnly: { description: 'arch', ...numberConfigHelper(1) },
      });
      const sequencerComposed = composeConfigMappings(sharedBlobMappings, {
        sequencerOnly: { description: 'seq', ...numberConfigHelper(2) },
      });
      expect(findUniversalConfigKeys(archiverComposed, sequencerComposed)).toEqual(new Set(['blobUrl']));
    });
  });
});
