import { aztecNodeConfigMappings } from '@aztec/aztec-node/config';
import { getKeys } from '@aztec/foundation/collection';
import type { ConfigMappingsType } from '@aztec/foundation/config';
import { dataConfigMappings } from '@aztec/kv-store/config';
import { telemetryClientConfigMappings } from '@aztec/telemetry-client';

import { type L2ChainConfig, devnetL2ChainConfig, enrichEnvironmentWithChainConfig } from './chain_l2_config.js';

describe('enrichEnvironmentWithChainConfig', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore original environment
    process.env = { ...originalEnv };
  });

  it('should set environment variables for all L2ChainConfig properties', () => {
    // Set up a config object with every single possible property from L2ChainConfig
    const config: Required<L2ChainConfig> = {
      ...devnetL2ChainConfig,
      slashingQuorum: 10,
      governanceProposerQuorum: 10,
      autoUpdateUrl: 'https://example.com/auto-update',
      publicIncludeMetrics: ['foo'],
      publicMetricsCollectorUrl: 'https://example.com/metrics',
      publicMetricsCollectFrom: ['bar'],
      skipArchiverInitialSync: true,
      blobAllowEmptySources: true,
    };

    // Enrich env with those
    enrichEnvironmentWithChainConfig(config);

    // Assemble config mapping such that we know how to go from config property to env var
    const configMappings: ConfigMappingsType<L2ChainConfig> = {
      ...aztecNodeConfigMappings,
      ...telemetryClientConfigMappings,
      ...dataConfigMappings,
    };

    // Check they were all set
    for (const key of getKeys(config)) {
      const envVar = configMappings[key].env!;
      const envValue = process.env[envVar];
      const configValue = config[key];
      const expectedEnvValue = Array.isArray(configValue) ? configValue.join(',') : configValue!.toString();
      expect(envValue).toBeDefined();
      expect(envValue).toBe(expectedEnvValue);
    }

    // Regression: verify the four previously missing properties are now set
    expect(process.env['AZTEC_LAG_IN_EPOCHS']).toBe(config.lagInEpochs.toString());
    expect(process.env['AZTEC_SLASHING_DISABLE_DURATION']).toBe(config.slashingDisableDuration.toString());
    expect(process.env['SLASH_GRACE_PERIOD_L2_SLOTS']).toBe(config.slashGracePeriodL2Slots.toString());
    expect(process.env['SLASH_EXECUTE_ROUNDS_LOOK_BACK']).toBe(config.slashExecuteRoundsLookBack.toString());
  });
});
