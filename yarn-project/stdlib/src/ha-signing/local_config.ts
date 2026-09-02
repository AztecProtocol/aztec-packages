import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  optionalNumberConfigHelper,
} from '@aztec/foundation/config';
import { zodFor } from '@aztec/foundation/schemas';
import { type DataStoreConfig, dataConfigMappings } from '@aztec/stdlib/kv-store';

import { z } from 'zod';

import { type BaseSignerConfig, BaseSignerConfigSchema, baseSignerConfigMappings } from './config.js';

/**
 * Configuration for local (single-node) slashing protection.
 *
 * Combines the base signing protection fields (shared with HA mode) with
 * DataStoreConfig for the local LMDB backing store, plus a per-store map-size
 * override. Used when HA signing is disabled.
 */
export type LocalSignerConfig = BaseSignerConfig &
  DataStoreConfig & {
    /** Maximum size of the local signing-protection LMDB store in KB. Overwrites the general dataStoreMapSizeKb. */
    signingProtectionMapSizeKb?: number;
    /**
     * Allow local signing protection to run against an ephemeral store when no data directory is set.
     * Without this, a missing data directory fails startup, since ephemeral protection does not survive
     * restarts. Intended for dev/test networks only; production validators must persist to disk.
     */
    allowEphemeralSigningProtection?: boolean;
  };

export const localSignerConfigMappings: ConfigMappingsType<LocalSignerConfig> = {
  ...baseSignerConfigMappings,
  ...dataConfigMappings,
  signingProtectionMapSizeKb: {
    env: 'SIGNING_PROTECTION_MAP_SIZE_KB',
    description:
      'Maximum size of the local signing-protection LMDB store in KB. Overwrites the general dataStoreMapSizeKb.',
    ...optionalNumberConfigHelper(),
  },
  allowEphemeralSigningProtection: {
    env: 'VALIDATOR_ALLOW_EPHEMERAL_SIGNING_PROTECTION',
    description:
      'Allow local signing protection to run against an ephemeral store when no data directory is set (dev/test only). ' +
      'Ephemeral protection does not survive restarts, so this is unsafe for production validators.',
    ...booleanConfigHelper(false),
  },
};

export const LocalSignerConfigSchema = zodFor<LocalSignerConfig>()(
  BaseSignerConfigSchema.extend({
    dataDirectory: z.string().optional(),
    dataStoreMapSizeKb: z.number(),
    dataStoreMaxReaders: z.number().optional(),
    signingProtectionMapSizeKb: z.number().optional(),
    allowEphemeralSigningProtection: z.boolean().optional(),
  }),
);

/**
 * Returns the local signer configuration from environment variables.
 */
export function getLocalSignerConfigEnvVars(): LocalSignerConfig {
  return getConfigFromMappings<LocalSignerConfig>(localSignerConfigMappings);
}
