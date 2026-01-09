import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
} from '@aztec/foundation/config';

/**
 * Configuration for the slashing protection service
 */
export interface SlashingProtectionConfig {
  /** Whether slashing protection is enabled */
  enabled: boolean;
  /** Unique identifier for this node */
  nodeId: string;
  /** How long to wait between polls when a duty is being signed (ms) */
  pollingIntervalMs: number;
  /** Maximum time to wait for a duty being signed to complete (ms) */
  signingTimeoutMs: number;
  /** Maximum age of a stuck duty in ms */
  maxStuckDutiesAgeMs: number;
}

export const slashingProtectionConfigMappings: ConfigMappingsType<SlashingProtectionConfig> = {
  enabled: {
    env: 'SLASHING_PROTECTION_ENABLED',
    description: 'Whether slashing protection is enabled',
    ...booleanConfigHelper(true),
  },
  nodeId: {
    env: 'SLASHING_PROTECTION_NODE_ID',
    description: 'The unique identifier for this node',
    defaultValue: '',
  },
  pollingIntervalMs: {
    env: 'SLASHING_PROTECTION_POLLING_INTERVAL_MS',
    description: 'The number of ms to wait between polls when a duty is being signed',
    ...numberConfigHelper(100),
  },
  signingTimeoutMs: {
    env: 'SLASHING_PROTECTION_SIGNING_TIMEOUT_MS',
    description: 'The maximum time to wait for a duty being signed to complete',
    ...numberConfigHelper(3_000),
  },
  maxStuckDutiesAgeMs: {
    env: 'SLASHING_PROTECTION_MAX_STUCK_DUTIES_AGE_MS',
    description: 'The maximum age of a stuck duty in ms',
    // hard-coding at current 2 slot duration. This should be set by the validator on init
    ...numberConfigHelper(72_000),
  },
};

export const defaultSlashingProtectionConfig: SlashingProtectionConfig = getDefaultConfig(
  slashingProtectionConfigMappings,
);

/**
 * Configuration for creating an HA signer with PostgreSQL backend
 */
export interface CreateHASignerConfig extends SlashingProtectionConfig {
  /**
   * PostgreSQL connection string
   * Format: postgresql://user:password@host:port/database
   */
  databaseUrl: string;
  /**
   * PostgreSQL connection pool configuration
   */
  /** Maximum number of clients in the pool (default: 10) */
  poolMaxCount?: number;
  /** Minimum number of clients in the pool (default: 0) */
  poolMinCount?: number;
  /** Idle timeout in milliseconds (default: 10000) */
  poolIdleTimeoutMs?: number;
  /** Connection timeout in milliseconds (default: 0, no timeout) */
  poolConnectionTimeoutMs?: number;
}

export const createHASignerConfigMappings: ConfigMappingsType<CreateHASignerConfig> = {
  ...slashingProtectionConfigMappings,
  databaseUrl: {
    env: 'VALIDATOR_HA_DATABASE_URL',
    description:
      'PostgreSQL connection string for validator HA signer (format: postgresql://user:password@host:port/database)',
  },
  poolMaxCount: {
    env: 'VALIDATOR_HA_POOL_MAX',
    description: 'Maximum number of clients in the pool',
    ...numberConfigHelper(10),
  },
  poolMinCount: {
    env: 'VALIDATOR_HA_POOL_MIN',
    description: 'Minimum number of clients in the pool',
    ...numberConfigHelper(0),
  },
  poolIdleTimeoutMs: {
    env: 'VALIDATOR_HA_POOL_IDLE_TIMEOUT_MS',
    description: 'Idle timeout in milliseconds',
    ...numberConfigHelper(10_000),
  },
  poolConnectionTimeoutMs: {
    env: 'VALIDATOR_HA_POOL_CONNECTION_TIMEOUT_MS',
    description: 'Connection timeout in milliseconds (0 means no timeout)',
    ...numberConfigHelper(0),
  },
};

/**
 * Returns the validator HA signer configuration from environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The validator HA signer configuration.
 */
export function getConfigEnvVars(): CreateHASignerConfig {
  return getConfigFromMappings<CreateHASignerConfig>(createHASignerConfigMappings);
}
