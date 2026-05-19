import { z } from 'zod';

import type { ConfigMappingsType } from './index.js';

export const NetworkConfigSchema = z
  .object({
    bootnodes: z.array(z.string()),
    snapshots: z.array(z.string()),
    blobFileStoreUrls: z.array(z.string()).optional(),
    txCollectionFileStoreUrls: z.array(z.string()).optional(),
    registryAddress: z.string(),
    feeAssetHandlerAddress: z.string().optional(),
    l1ChainId: z.number(),
    blockDurationMs: z.number().positive().optional(),
    txPublicSetupAllowListExtend: z.string().optional(),
    nodeVersion: z.string().optional(),
  })
  .passthrough(); // Allow additional unknown fields to pass through

export const NetworkConfigMapSchema = z.record(z.string(), NetworkConfigSchema);

export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;
export type NetworkConfigMap = z.infer<typeof NetworkConfigMapSchema>;

// Each entry: [networkConfig source key, target camelCase key, useParseEnv]
// useParseEnv=true: source is a string that needs mapping.parseEnv called on it.
// useParseEnv=false: source value is already the correct type and is passed through.
const NETWORK_FIELD_MAP = [
  ['bootnodes', 'bootstrapNodes', false],
  ['l1ChainId', 'l1ChainId', false],
  ['snapshots', 'snapshotsUrls', false],
  ['registryAddress', 'registryAddress', true],
  ['feeAssetHandlerAddress', 'feeAssetHandlerAddress', true],
  ['blobFileStoreUrls', 'blobFileStoreUrls', false],
  ['txCollectionFileStoreUrls', 'txCollectionFileStoreUrls', false],
  ['blockDurationMs', 'blockDurationMs', false],
  ['txPublicSetupAllowListExtend', 'txPublicSetupAllowListExtend', true],
] as const satisfies ReadonlyArray<readonly [keyof NetworkConfig, string, boolean]>;

/**
 * Converts a typed `NetworkConfig` (fetched from a remote source) into a `Partial<T>` suitable
 * for use as the NETWORK layer in `resolveConfig`.
 *
 * Fields that are already the correct TypeScript type (arrays, numbers) are passed through
 * unchanged. String fields that consumers expect as structured values (addresses, allow-lists)
 * are parsed via `mappings[targetKey].parseEnv` — foundation never imports those parsers
 * directly; they arrive through the mapping.
 *
 * Target keys absent from `mappings` are silently skipped, so this function can safely feed
 * a sub-config (e.g. just P2PConfig) that only covers a subset of the network fields.
 *
 * @param mappings - Config mappings for the target type `T`.
 * @param networkConfig - Typed network configuration object.
 */
export function networkConfigToTyped<T>(mappings: ConfigMappingsType<T>, networkConfig: NetworkConfig): Partial<T> {
  const result: Partial<T> = {};

  for (const [sourceKey, targetKey, useParseEnv] of NETWORK_FIELD_MAP) {
    const sourceValue = networkConfig[sourceKey];

    if (sourceValue === undefined) {
      continue;
    }
    if (Array.isArray(sourceValue) && sourceValue.length === 0) {
      continue;
    }
    if (!(targetKey in mappings)) {
      continue;
    }

    const mapping = mappings[targetKey as keyof T];

    try {
      if (useParseEnv) {
        if (mapping.parseEnv === undefined) {
          throw new Error(`No parseEnv defined on mapping`);
        }
        result[targetKey as keyof T] = mapping.parseEnv(sourceValue as string) as T[keyof T];
      } else {
        result[targetKey as keyof T] = sourceValue as unknown as T[keyof T];
      }
    } catch (e: any) {
      throw new Error(`Failed to parse config '${targetKey}' (env: ${mapping.env ?? 'none'}): ${e.message}`);
    }
  }

  return result;
}
