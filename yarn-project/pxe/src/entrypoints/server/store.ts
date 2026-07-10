import type { EthAddress } from '@aztec/foundation/eth-address';
import { type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { type AztecLMDBStoreV2, openStoreAt } from '@aztec/kv-store/lmdb-v2';

import { mkdir } from 'fs/promises';
import { join } from 'path';

import { storeIdentitySlug } from '../../storage/store_identity.js';

/** Location and identity inputs for opening an identity-partitioned PXE-side store. */
export type IdentityStoreConfig = {
  dataDirectory: string;
  /** Maximum LMDB map size in KB. When omitted, the kv-store default map size applies. */
  dataStoreMapSizeKb?: number;
  l1ChainId: number;
  rollupAddress: EthAddress;
};

/**
 * Opens the persistent LMDB store selected by `name` and identity triple `(l1ChainId, rollupAddress, schemaVersion)`.
 * A store exists per identity: reopening with the same identity returns the same data, a different identity selects
 * a different (possibly fresh) store. Callers wanting an ephemeral store use `openTmpStore` explicitly instead.
 */
export async function openStore(
  name: string,
  schemaVersion: number,
  config: IdentityStoreConfig,
  bindings?: LoggerBindings,
): Promise<AztecLMDBStoreV2> {
  // Stores live under `<dataDirectory>/<name>-stores/<l1ChainId>-<rollupAddress>-v<schemaVersion>`, a sibling of the
  // legacy `<dataDirectory>/<name>` directory: older binaries reset the legacy directory on a rollup mismatch, so
  // per-identity stores must not nest inside it.
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
