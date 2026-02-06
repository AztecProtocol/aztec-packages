import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { DatabaseVersion } from '@aztec/stdlib/database-version/version';

import type { AztecAsyncSingleton, AztecSingleton } from './interfaces/singleton.js';
import type { AztecAsyncKVStore, AztecKVStore } from './interfaces/store.js';
import { isSyncStore } from './interfaces/utils.js';

/**
 * Clears the store if the schema version or rollup address does not match the one stored in the database.
 * Also clears if migrating from an older store format that didn't track schema version.
 * This is to prevent data from being accidentally mixed up between different rollup instances or schema versions.
 * @param store - The store to check
 * @param targetSchemaVersion - The current schema version
 * @param rollupAddress - The ETH address of the rollup contract
 * @param log - Optional logger
 * @returns The store (cleared if necessary)
 */
export async function initStoreForRollupAndSchemaVersion<T extends AztecKVStore | AztecAsyncKVStore>(
  store: T,
  schemaVersion: number | undefined,
  rollupAddress: EthAddress | undefined,
  log?: Logger,
): Promise<T> {
  const targetSchemaVersion = schemaVersion ?? 0;
  const targetRollupAddress = rollupAddress ?? EthAddress.ZERO;
  const targetDatabaseVersion = new DatabaseVersion(targetSchemaVersion, targetRollupAddress);

  // DB version: database schema version + rollup address combined)
  const dbVersion = store.openSingleton<string>('dbVersion');

  const storedDatabaseVersion = isSyncStore(store)
    ? (dbVersion as AztecSingleton<string>).get()
    : await (dbVersion as AztecAsyncSingleton<string>).getAsync();

  // Check if this is an old format store (has rollupAddress singleton but no dbVersion)
  const oldRollupSingleton = store.openSingleton<string>('rollupAddress');
  const hasOldFormat = isSyncStore(store)
    ? !storedDatabaseVersion && !!(oldRollupSingleton as AztecSingleton<string>).get()
    : !storedDatabaseVersion && !!(await (oldRollupSingleton as AztecAsyncSingleton<string>).getAsync());

  if (
    hasOldFormat ||
    doesStoreNeedToBeCleared(
      targetDatabaseVersion,
      storedDatabaseVersion,
      targetSchemaVersion,
      targetRollupAddress,
      log,
    )
  ) {
    if (hasOldFormat) {
      log?.warn('Detected old store format without dbVersion, clearing database');
    }
    await store.clear();
  }

  await dbVersion.set(targetDatabaseVersion.toBuffer().toString('utf-8'));

  return store;
}

function doesStoreNeedToBeCleared(
  targetDatabaseVersion: DatabaseVersion,
  storedDatabaseVersion: string | undefined,
  targetSchemaVersion: number,
  targetRollupAddress: EthAddress,
  log?: Logger,
) {
  if (storedDatabaseVersion) {
    try {
      const storedVersion = DatabaseVersion.fromBuffer(Buffer.from(storedDatabaseVersion, 'utf-8'));
      const cmp = storedVersion.cmp(targetDatabaseVersion);

      if (cmp === undefined) {
        log?.warn('Rollup address changed, clearing database', {
          stored: storedVersion.rollupAddress.toString(),
          current: targetRollupAddress.toString(),
        });
        return true;
      }

      if (cmp !== 0) {
        log?.warn('Schema version changed, clearing database', {
          stored: storedVersion.schemaVersion,
          current: targetSchemaVersion,
        });

        return true;
      }
    } catch (err) {
      log?.warn('Failed to parse stored version, clearing database', { err });
      return true;
    }
  }

  return false;
}
