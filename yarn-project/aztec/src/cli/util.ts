import { ArchiverConfig } from '@aztec/archiver';
import { LogFn } from '@aztec/foundation/log';

import { LevelDown, default as leveldown } from 'leveldown';
import { RootDatabase, open } from 'lmdb';
import { MemDown, default as memdown } from 'memdown';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;
export const createLevelDown = (path: string) => (leveldown as any)(path) as LevelDown;

const DB_SUBDIR = 'aztec-archiver-db';
const ARCHIVER_METADATA_KEY = '@@aztec_archiver_metadata';

/**
 * The metadata for an aztec node.
 */
type ArchiverMetadata = {
  /**
   * The address of the rollup contract on L1
   */
  rollupContractAddress: string;
};

/**
 * Opens the database for the archiver. If a data directory is specified, then this attempts to create it.
 * @param config - The configuration to be used by the archiver.
 * @throws If `config.dataDirectory` is set and the directory cannot be created.
 * @returns The database instance for the archiver.
 */
export async function openDb(config: ArchiverConfig, log: LogFn): Promise<RootDatabase> {
  const archiverMetadata: ArchiverMetadata = {
    rollupContractAddress: config.l1Contracts.rollupAddress.toString(),
  };

  let archiverDb: RootDatabase;

  if (config.dataDirectory) {
    const dir = join(config.dataDirectory, DB_SUBDIR);
    // this throws if we don't have permissions to create the directory
    await mkdir(dir, { recursive: true });

    log(`Opening archiver database at ${dir}`);
    archiverDb = open(dir, {});
  } else {
    log('Opening temporary databases');
    // not passing a path will use a temp file that gets deleted when the process exits
    archiverDb = open({});
  }

  await checkArchiverMetadataAndClear(archiverDb, archiverMetadata, log);
  return archiverDb;
}

/**
 * Checks the archiver metadata and clears the database if the rollup contract address has changed.
 * @param archiverDb - The database for the aztec archiver.
 * @param archiverMetadata - The metadata for the aztec archiver.
 */
async function checkArchiverMetadataAndClear(
  archiverDb: RootDatabase,
  archiverMetadata: ArchiverMetadata,
  log: LogFn,
): Promise<void> {
  const metadataDB = archiverDb.openDB<ArchiverMetadata, string>('metadata', {});
  try {
    const existing = metadataDB.get(ARCHIVER_METADATA_KEY);
    // if the rollup addresses are different, wipe the local database and start over
    if (!existing || existing.rollupContractAddress !== archiverMetadata.rollupContractAddress) {
      log('Rollup contract address has changed, clearing databases');
      await archiverDb.clearAsync();
    }
    await metadataDB.put(ARCHIVER_METADATA_KEY, archiverMetadata);
  } finally {
    await metadataDB.close();
  }
}
