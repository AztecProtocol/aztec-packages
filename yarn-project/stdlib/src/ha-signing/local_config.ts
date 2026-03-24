import { type ConfigMappingsType, getConfigFromMappings } from '@aztec/foundation/config';
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
  };

export const localSignerConfigMappings: ConfigMappingsType<LocalSignerConfig> = {
  ...baseSignerConfigMappings,
  ...dataConfigMappings,
  signingProtectionMapSizeKb: {
    env: 'SIGNING_PROTECTION_MAP_SIZE_KB',
    description:
      'Maximum size of the local signing-protection LMDB store in KB. Overwrites the general dataStoreMapSizeKb.',
    parseEnv: (val: string | undefined) => (val ? +val : undefined),
  },
};

export const LocalSignerConfigSchema = zodFor<LocalSignerConfig>()(
  BaseSignerConfigSchema.extend({
    dataDirectory: z.string().optional(),
    dataStoreMapSizeKb: z.number(),
    signingProtectionMapSizeKb: z.number().optional(),
  }),
);

/**
 * Returns the local signer configuration from environment variables.
 */
export function getLocalSignerConfigEnvVars(): LocalSignerConfig {
  return getConfigFromMappings<LocalSignerConfig>(localSignerConfigMappings);
}
