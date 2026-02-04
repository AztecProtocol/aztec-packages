import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { ZodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

/**
 * Configuration for the Validator HA Signer
 *
 * This config is used for distributed locking and slashing protection
 * when running multiple validator nodes in a high-availability setup.
 */
export interface ValidatorHASignerConfig {
  /** Whether HA signing / slashing protection is enabled */
  haSigningEnabled: boolean;
  /** L1 contract addresses (rollup address required) */
  l1Contracts: Pick<L1ContractAddresses, 'rollupAddress'>;
  /** Unique identifier for this node */
  nodeId: string;
  /** How long to wait between polls when a duty is being signed (ms) */
  pollingIntervalMs: number;
  /** Maximum time to wait for a duty being signed to complete (ms) */
  signingTimeoutMs: number;
  /** Maximum age of a stuck duty in ms (defaults to 2x hardcoded Aztec slot duration if not set) */
  maxStuckDutiesAgeMs?: number;
  /** Optional: clean up old duties after this many hours (disabled if not set) */
  cleanupOldDutiesAfterHours?: number;
  /**
   * PostgreSQL connection string
   * Format: postgresql://user:password@host:port/database
   */
  databaseUrl?: string;
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

export const validatorHASignerConfigMappings: ConfigMappingsType<ValidatorHASignerConfig> = {
  haSigningEnabled: {
    env: 'VALIDATOR_HA_SIGNING_ENABLED',
    description: 'Whether HA signing / slashing protection is enabled',
    ...booleanConfigHelper(false),
  },
  l1Contracts: {
    description: 'L1 contract addresses (rollup address required)',
    nested: {
      rollupAddress: {
        description: 'The Ethereum address of the rollup contract (must be set programmatically)',
        parseEnv: (val: string) => EthAddress.fromString(val),
      },
    },
  },
  nodeId: {
    env: 'VALIDATOR_HA_NODE_ID',
    description: 'The unique identifier for this node',
    defaultValue: '',
  },
  pollingIntervalMs: {
    env: 'VALIDATOR_HA_POLLING_INTERVAL_MS',
    description: 'The number of ms to wait between polls when a duty is being signed',
    ...numberConfigHelper(100),
  },
  signingTimeoutMs: {
    env: 'VALIDATOR_HA_SIGNING_TIMEOUT_MS',
    description: 'The maximum time to wait for a duty being signed to complete',
    ...numberConfigHelper(3_000),
  },
  maxStuckDutiesAgeMs: {
    env: 'VALIDATOR_HA_MAX_STUCK_DUTIES_AGE_MS',
    description: 'The maximum age of a stuck duty in ms (defaults to 2x Aztec slot duration)',
    ...optionalNumberConfigHelper(),
  },
  cleanupOldDutiesAfterHours: {
    env: 'VALIDATOR_HA_OLD_DUTIES_MAX_AGE_H',
    description: 'Optional: clean up old duties after this many hours (disabled if not set)',
    ...optionalNumberConfigHelper(),
  },
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

export const defaultValidatorHASignerConfig: ValidatorHASignerConfig = getDefaultConfig(
  validatorHASignerConfigMappings,
);

/**
 * Returns the validator HA signer configuration from environment variables.
 * Note: If an environment variable is not set, the default value is used.
 * @returns The validator HA signer configuration.
 */
export function getConfigEnvVars(): ValidatorHASignerConfig {
  return getConfigFromMappings<ValidatorHASignerConfig>(validatorHASignerConfigMappings);
}

export const ValidatorHASignerConfigSchema = z.object({
  haSigningEnabled: z.boolean(),
  l1Contracts: z.object({
    rollupAddress: z.instanceof(EthAddress),
  }),
  nodeId: z.string(),
  pollingIntervalMs: z.number().min(0),
  signingTimeoutMs: z.number().min(0),
  maxStuckDutiesAgeMs: z.number().min(0).optional(),
  cleanupOldDutiesAfterHours: z.number().min(0).optional(),
  databaseUrl: z.string().optional(),
  poolMaxCount: z.number().min(0).optional(),
  poolMinCount: z.number().min(0).optional(),
  poolIdleTimeoutMs: z.number().min(0).optional(),
  poolConnectionTimeoutMs: z.number().min(0).optional(),
}) satisfies ZodFor<ValidatorHASignerConfig>;
