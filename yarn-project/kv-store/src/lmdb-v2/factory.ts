import { EthAddress } from '@aztec/foundation/eth-address';
import { type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { DatabaseVersionManager, type SchemaVersionMismatchPolicy } from '@aztec/stdlib/database-version/manager';
import type { DataStoreConfig } from '@aztec/stdlib/kv-store';

import { copyFile, mkdir, mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { AztecLMDBStoreV2 } from './store.js';

const MAX_READERS = 16;

/** Optional versioning hooks for persistent LMDB stores. */
export type CreateStoreOptions = {
  onUpgrade?: (dataDir: string, currentVersion: number, latestVersion: number) => Promise<void>;
  schemaVersionMismatchPolicy?: SchemaVersionMismatchPolicy;
};

export async function createStore(
  name: string,
  schemaVersion: number,
  config: DataStoreConfig,
  bindings?: LoggerBindings,
  options: CreateStoreOptions = {},
): Promise<AztecLMDBStoreV2> {
  const log = createLogger('kv-store:lmdb-v2:' + name, bindings);
  const { dataDirectory, rollupAddress: rollupFromConfig } = config;

  let store: AztecLMDBStoreV2;
  if (typeof dataDirectory !== 'undefined') {
    // Get rollup address from contracts config, or use zero address
    const subDir = join(dataDirectory, name);
    await mkdir(subDir, { recursive: true });

    const rollupAddress = rollupFromConfig ?? EthAddress.ZERO;

    // Create a version manager
    const versionManager = new DatabaseVersionManager({
      schemaVersion,
      rollupAddress,
      dataDirectory: subDir,
      onOpen: dbDirectory =>
        AztecLMDBStoreV2.new(dbDirectory, config.dataStoreMapSizeKb, MAX_READERS, () => Promise.resolve(), bindings),
      onUpgrade: options.onUpgrade,
      schemaVersionMismatchPolicy: options.schemaVersionMismatchPolicy,
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

/**
 * Open a persistent on-disk store rooted in OS tmpdir. Caller chooses whether to
 * auto-remove the directory on close. Uses standard durable LMDB flags (fsync on
 * every commit) — for full in-memory / NOSYNC semantics use `openEphemeralStore`.
 */
export async function openTmpStore(
  name: string,
  cleanupTmpDir: boolean = true,
  dbMapSizeKb = 10 * 1_024 * 1_024, // 10GB
  maxReaders = MAX_READERS,
  bindings?: LoggerBindings,
): Promise<AztecLMDBStoreV2> {
  const log = createLogger('kv-store:lmdb-v2:' + name, bindings);
  const dataDir = await mkdtemp(join(tmpdir(), name + '-'));
  log.debug(`Created temporary data store at: ${dataDir} with size: ${dbMapSizeKb} KB (LMDB v2)`);

  // pass a cleanup callback because process.on('beforeExit', cleanup) does not work under Jest
  const cleanup = async () => {
    if (cleanupTmpDir) {
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

  return AztecLMDBStoreV2.new(dataDir, dbMapSizeKb, maxReaders, cleanup, bindings, false);
}

/**
 * Open a fully-ephemeral store: a fresh tmpdir backing file, LMDB opened with
 * MDB_NOSYNC | MDB_NOMETASYNC (no fsync, kernel-only writeback), and the directory
 * unconditionally removed on close. Intended for tests and worker-local scratch
 * stores where durability is explicitly not desired.
 */
export async function openEphemeralStore(
  name: string,
  dbMapSizeKb = 10 * 1_024 * 1_024, // 10GB
  maxReaders = MAX_READERS,
  bindings?: LoggerBindings,
): Promise<AztecLMDBStoreV2> {
  const log = createLogger('kv-store:lmdb-v2:' + name, bindings);
  const dataDir = await mkdtemp(join(tmpdir(), name + '-'));
  log.debug(`Created ephemeral data store at: ${dataDir} with size: ${dbMapSizeKb} KB (LMDB v2)`);

  const cleanup = async () => {
    try {
      await rm(dataDir, { recursive: true, force: true, maxRetries: 3 });
      log.debug(`Deleted ephemeral data store: ${dataDir}`);
    } catch (err) {
      log.warn(`Failed to delete ephemeral data directory (LMDB v2) ${dataDir}: ${err}`);
    }
  };

  return AztecLMDBStoreV2.new(dataDir, dbMapSizeKb, maxReaders, cleanup, bindings, true);
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

/**
 * Open a fully-ephemeral store seeded from an existing `data.mdb` file. Creates a fresh tmpdir,
 * copies `srcDataMdbPath` into it as `data.mdb`, opens with MDB_NOSYNC | MDB_NOMETASYNC, and
 * removes the tmpdir on close. Intended for worker clones of a main-thread-built store — the
 * source file is never written to.
 */
export async function cloneEphemeralStoreFrom(
  srcDataMdbPath: string,
  name: string,
  dbMapSizeKb = 10 * 1_024 * 1_024, // 10GB
  maxReaders = MAX_READERS,
  bindings?: LoggerBindings,
): Promise<AztecLMDBStoreV2> {
  const log = createLogger('kv-store:lmdb-v2:' + name, bindings);
  const dataDir = await mkdtemp(join(tmpdir(), name + '-'));
  await copyFile(srcDataMdbPath, join(dataDir, 'data.mdb'));
  log.debug(`Cloned ephemeral data store at: ${dataDir} from ${srcDataMdbPath} (LMDB v2)`);

  const cleanup = async () => {
    try {
      await rm(dataDir, { recursive: true, force: true, maxRetries: 3 });
      log.debug(`Deleted ephemeral data store: ${dataDir}`);
    } catch (err) {
      log.warn(`Failed to delete ephemeral data directory (LMDB v2) ${dataDir}: ${err}`);
    }
  };

  return AztecLMDBStoreV2.new(dataDir, dbMapSizeKb, maxReaders, cleanup, bindings, true);
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
