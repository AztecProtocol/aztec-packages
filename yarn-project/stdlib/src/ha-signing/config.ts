import {
  type L1ContractAddresses,
  pickL1ContractAddressMappings,
  pickL1ContractAddressesSchema,
} from '@aztec/ethereum/l1-contract-addresses';
import {
  type ConfigMappingsType,
  SecretValue,
  booleanConfigHelper,
  getConfigFromMappings,
  getDefaultConfig,
  numberConfigHelper,
  optionalNumberConfigHelper,
  secretStringConfigHelper,
} from '@aztec/foundation/config';
import type { ZodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

/**
 * Base signing protection configuration shared by both HA (Postgres) and local (LMDB) signers.
 */
export type BaseSignerConfig = {
  /** Unique identifier for this node */
  nodeId: string;
  /** How long to wait between polls when a duty is being signed (ms) */
  pollingIntervalMs: number;
  /**
   * Maximum time (ms) to wait for ANOTHER node's in-progress signing to complete before giving up
   * and treating the duty as already handled. This is the cross-node wait/poll timeout, distinct
   * from signingOperationTimeoutMs (this node's own hard upper bound on a single signing call).
   */
  signingTimeoutMs: number;
  /**
   * Hard upper bound (ms) on a single signing operation on this node. If the (possibly remote)
   * signer does not return within this time, the operation is aborted, the duty lock is released,
   * and signing fails so it can be safely retried. Must stay well below maxStuckDutiesAgeMs so a
   * slow signer's lock is released before the stuck-duty cleanup could reclaim it. Defaults to
   * 30_000 when unset.
   */
  signingOperationTimeoutMs?: number;
  /** Maximum age of a stuck duty in ms (defaults to 2x hardcoded Aztec slot duration if not set) */
  maxStuckDutiesAgeMs?: number;
  /** Optional: clean up old duties after this many hours (disabled if not set) */
  cleanupOldDutiesAfterHours?: number;
} & Pick<L1ContractAddresses, 'rollupAddress'>;

export const baseSignerConfigMappings: ConfigMappingsType<BaseSignerConfig> = {
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
    description: "The maximum time to wait for another node's in-progress signing to complete",
    ...numberConfigHelper(3_000),
  },
  signingOperationTimeoutMs: {
    env: 'VALIDATOR_SIGNING_OPERATION_TIMEOUT_MS',
    description: 'Hard upper bound in ms on a single signing operation before it is aborted (default 30000)',
    ...numberConfigHelper(30_000),
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
  ...pickL1ContractAddressMappings('rollupAddress'),
};

export const BaseSignerConfigSchema = z.object({
  nodeId: z.string(),
  pollingIntervalMs: z.number().min(0),
  signingTimeoutMs: z.number().min(0),
  signingOperationTimeoutMs: z.number().min(0).optional(),
  maxStuckDutiesAgeMs: z.number().min(0).optional(),
  cleanupOldDutiesAfterHours: z.number().min(0).optional(),
  ...pickL1ContractAddressesSchema('rollupAddress'),
}) satisfies ZodFor<BaseSignerConfig>;

/**
 * Configuration for the Validator HA Signer.
 *
 * Extends BaseSignerConfig with a flag to enable HA mode and Postgres connection settings.
 */
export interface ValidatorHASignerConfig extends BaseSignerConfig {
  /** Whether HA signing / slashing protection is enabled */
  haSigningEnabled: boolean;
  /**
   * PostgreSQL connection string
   * Format: postgresql://user:password@host:port/database
   */
  databaseUrl?: SecretValue<string>;
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
  ...baseSignerConfigMappings,
  haSigningEnabled: {
    env: 'VALIDATOR_HA_SIGNING_ENABLED',
    description: 'Whether HA signing / slashing protection is enabled',
    ...booleanConfigHelper(false),
  },
  databaseUrl: {
    env: 'VALIDATOR_HA_DATABASE_URL',
    description:
      'PostgreSQL connection string for validator HA signer (format: postgresql://user:password@host:port/database)',
    ...secretStringConfigHelper(),
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

export const ValidatorHASignerConfigSchema = BaseSignerConfigSchema.extend({
  haSigningEnabled: z.boolean(),
  databaseUrl: SecretValue.schema(z.string()).optional(),
  poolMaxCount: z.number().min(0).optional(),
  poolMinCount: z.number().min(0).optional(),
  poolIdleTimeoutMs: z.number().min(0).optional(),
  poolConnectionTimeoutMs: z.number().min(0).optional(),
}) satisfies ZodFor<ValidatorHASignerConfig>;
