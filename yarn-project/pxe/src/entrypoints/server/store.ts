import type { EthAddress } from '@aztec/foundation/eth-address';
import { type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { type AztecLMDBStoreV2, openStoreAt, openTmpStore, storeIdentitySlug } from '@aztec/kv-store/lmdb-v2';

import { mkdir } from 'fs/promises';
import { join } from 'path';

/** Location and identity inputs for opening an identity-partitioned PXE-side store. */
export type IdentityStoreConfig = {
  dataDirectory?: string;
  /** Maximum LMDB map size in KB. When omitted, the kv-store default map size applies. */
  dataStoreMapSizeKb?: number;
  l1ChainId?: number;
  rollupAddress?: EthAddress;
};

/**
 * Opens the persistent LMDB store selected by `name` and the identity `(l1ChainId, rollupAddress, schemaVersion)`.
 * A store exists per identity: reopening with the same identity returns the same data, a different identity selects
 * a different (possibly fresh) store. Nothing is ever cleared, and no version marker is kept — the directory name is
 * the identity. Falls back to an ephemeral tmp store when no data directory is configured.
 *
 * Stores live under `<dataDirectory>/<name>-stores/<slug>`, a sibling of the legacy `<dataDirectory>/<name>`
 * directory: older binaries reset the legacy directory on a rollup mismatch, so per-identity stores must not nest
 * inside it.
 */
export async function openStoreForIdentity(
  name: string,
  schemaVersion: number,
  config: IdentityStoreConfig,
  bindings?: LoggerBindings,
): Promise<AztecLMDBStoreV2> {
  if (!config.dataDirectory) {
    return openTmpStore(name, true, config.dataStoreMapSizeKb, undefined, bindings);
  }
  const subDir = join(
    config.dataDirectory,
    `${name}-stores`,
    storeIdentitySlug({ l1ChainId: config.l1ChainId, rollupAddress: config.rollupAddress, schemaVersion }),
  );
  await mkdir(subDir, { recursive: true });
  createLogger(`pxe:data:${name}`, bindings).info(`Opening ${name} data store (LMDB v2)`, {
    storeName: name,
    subDir,
    dataStoreMapSizeKb: config.dataStoreMapSizeKb,
  });
  return openStoreAt(subDir, config.dataStoreMapSizeKb, undefined, bindings);
}
