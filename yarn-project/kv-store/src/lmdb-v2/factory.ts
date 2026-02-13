import { EthAddress } from '@aztec/foundation/eth-address';
import { type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { DatabaseVersionManager } from '@aztec/stdlib/database-version/manager';

import { mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import type { DataStoreConfig } from '../config.js';
import { AztecLMDBStoreV2 } from './store.js';

const MAX_READERS = 16;

export async function createStore(
  name: string,
  schemaVersion: number,
  config: DataStoreConfig,
  bindings?: LoggerBindings,
): Promise<AztecLMDBStoreV2> {
  const log = createLogger('kv-store:lmdb-v2:' + name, bindings);
  const { dataDirectory, l1Contracts } = config;

  let store: AztecLMDBStoreV2;
  if (typeof dataDirectory !== 'undefined') {
    // Get rollup address from contracts config, or use zero address
    const subDir = join(dataDirectory, name);
    await mkdir(subDir, { recursive: true });

    const rollupAddress = l1Contracts ? l1Contracts.rollupAddress : EthAddress.ZERO;

    // Create a version manager
    const versionManager = new DatabaseVersionManager({
      schemaVersion,
      rollupAddress,
      dataDirectory: subDir,
      onOpen: dbDirectory =>
        AztecLMDBStoreV2.new(dbDirectory, config.dataStoreMapSizeKb, MAX_READERS, () => Promise.resolve(), bindings),
    });

    log.info(
      `Creating ${name} data store at directory ${subDir} with map size ${config.dataStoreMapSizeKb} KB (LMDB v2)`,
    );
    [store] = await versionManager.open();
  } else {
    store = await openTmpStore(name, true, config.dataStoreMapSizeKb, MAX_READERS, bindings);
  }

  return store;
}

export async function openTmpStore(
  name: string,
  ephemeral: boolean = true,
  dbMapSizeKb = 10 * 1_024 * 1_024, // 10GB
  maxReaders = MAX_READERS,
  bindings?: LoggerBindings,
): Promise<AztecLMDBStoreV2> {
  const log = createLogger('kv-store:lmdb-v2:' + name, bindings);
  const dataDir = await mkdtemp(join(tmpdir(), name + '-'));
  log.debug(`Created temporary data store at: ${dataDir} with size: ${dbMapSizeKb} KB (LMDB v2)`);

  // pass a cleanup callback because process.on('beforeExit', cleanup) does not work under Jest
  const cleanup = async () => {
    if (ephemeral) {
      try {
        await rm(dataDir, { recursive: true, force: true, maxRetries: 3 });
        log.debug(`Deleted temporary data store: ${dataDir}`);
      } catch (err) {
        log.warn(`Failed to delete temporary data directory (LMDB v2) ${dataDir}: ${err}`);
      }
    } else {
      log.debug(`Leaving temporary data store: ${dataDir}`);
    }
  };

  // For temporary stores, we don't need to worry about versioning
  // as they are ephemeral and get cleaned up after use
  return AztecLMDBStoreV2.new(dataDir, dbMapSizeKb, maxReaders, cleanup, bindings);
}

export async function openStoreAt(
  dataDir: string,
  dbMapSizeKb = 10 * 1_024 * 1_024, // 10GB
  maxReaders = MAX_READERS,
  bindings?: LoggerBindings,
): Promise<AztecLMDBStoreV2> {
  const log = createLogger('kv-store:lmdb-v2', bindings);
  log.debug(`Opening data store at: ${dataDir} with size: ${dbMapSizeKb} KB (LMDB v2)`);
  return await AztecLMDBStoreV2.new(dataDir, dbMapSizeKb, maxReaders, undefined, bindings);
}

export async function openVersionedStoreAt(
  dataDirectory: string,
  schemaVersion: number,
  rollupAddress: EthAddress,
  dbMapSizeKb = 10 * 1_024 * 1_024, // 10GB
  maxReaders = MAX_READERS,
  bindings?: LoggerBindings,
): Promise<AztecLMDBStoreV2> {
  const log = createLogger('kv-store:lmdb-v2', bindings);
  log.debug(`Opening data store at: ${dataDirectory} with size: ${dbMapSizeKb} KB (LMDB v2)`);
  const [store] = await new DatabaseVersionManager({
    schemaVersion,
    rollupAddress,
    dataDirectory,
    onOpen: dataDir => AztecLMDBStoreV2.new(dataDir, dbMapSizeKb, maxReaders, undefined, bindings),
  }).open();
  return store;
}
