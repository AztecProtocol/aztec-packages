import { EthAddress } from '@aztec/foundation/eth-address';

import { DatabaseVersion } from '../database-version/database_version.js';
import { mockLogger } from '../interfaces/utils.js';
import { initStoreForRollupAndSchemaVersion } from '../utils.js';
import { AztecIndexedDBStore } from './store.js';

describe('IndexedDB Version Management', () => {
  let store: AztecIndexedDBStore;
  const schemaVersion = 42;
  let rollupAddress: EthAddress;

  beforeEach(async () => {
    rollupAddress = EthAddress.random();
    // Create a fresh ephemeral store for each test
    store = await AztecIndexedDBStore.open(mockLogger, undefined, true);
  });

  afterEach(async () => {
    await store.delete();
  });

  describe('initStoreForRollup', () => {
    describe('fresh store (no existing data)', () => {
      it('stores version on first run', async () => {
        await initStoreForRollupAndSchemaVersion(store, schemaVersion, rollupAddress, mockLogger);

        const versionSingleton = store.openSingleton<string>('dbVersion');
        const stored = await versionSingleton.getAsync();

        const storedVersion = DatabaseVersion.fromBuffer(Buffer.from(stored!, 'utf-8'));
        expect(storedVersion.schemaVersion).toBe(schemaVersion);
        expect(storedVersion.rollupAddress.toString()).toBe(rollupAddress.toString());
      });
    });

    describe('store with matching version', () => {
      it('does not clear store when version matches', async () => {
        await initStoreForRollupAndSchemaVersion(store, schemaVersion, rollupAddress, mockLogger);

        const testMap = store.openMap<string, string>('test');
        await testMap.set('key', 'value');

        await initStoreForRollupAndSchemaVersion(store, schemaVersion, rollupAddress, mockLogger);

        // Data should still exist
        expect(await testMap.getAsync('key')).toBe('value');
      });
    });

    describe('store with different rollup address', () => {
      it('clears store when rollup address changes', async () => {
        await initStoreForRollupAndSchemaVersion(store, schemaVersion, rollupAddress, mockLogger);

        const testMap = store.openMap<string, string>('test');
        await testMap.set('key', 'value');

        const newRollupAddress = EthAddress.random();
        await initStoreForRollupAndSchemaVersion(store, schemaVersion, newRollupAddress, mockLogger);

        expect(await testMap.getAsync('key')).toBeUndefined();
      });
    });

    describe('store with different schema version', () => {
      it('clears store when schema version increases', async () => {
        await initStoreForRollupAndSchemaVersion(store, schemaVersion, rollupAddress, mockLogger);

        const testMap = store.openMap<string, string>('test');
        await testMap.set('key', 'value');

        await initStoreForRollupAndSchemaVersion(store, schemaVersion + 1, rollupAddress, mockLogger);

        expect(await testMap.getAsync('key')).toBeUndefined();
      });

      it('clears store when schema version decreases', async () => {
        await initStoreForRollupAndSchemaVersion(store, schemaVersion, rollupAddress, mockLogger);

        const testMap = store.openMap<string, string>('test');
        await testMap.set('key', 'value');

        await initStoreForRollupAndSchemaVersion(store, schemaVersion - 1, rollupAddress, mockLogger);

        expect(await testMap.getAsync('key')).toBeUndefined();
      });
    });

    describe('store with malformed version data', () => {
      it('clears store when version is malformed JSON', async () => {
        const versionSingleton = store.openSingleton<string>('dbVersion');
        await versionSingleton.set('not-valid-json');

        const testMap = store.openMap<string, string>('test');
        await testMap.set('key', 'value');

        await initStoreForRollupAndSchemaVersion(store, schemaVersion, rollupAddress, mockLogger);

        expect(await testMap.getAsync('key')).toBeUndefined();
      });

      it('clears store when version has wrong structure', async () => {
        const versionSingleton = store.openSingleton<string>('dbVersion');
        await versionSingleton.set(JSON.stringify({ foo: 'bar' }));

        const testMap = store.openMap<string, string>('test');
        await testMap.set('key', 'value');

        await initStoreForRollupAndSchemaVersion(store, schemaVersion, rollupAddress, mockLogger);

        expect(await testMap.getAsync('key')).toBeUndefined();
      });
    });

    describe('migration from old store format (pre-version management)', () => {
      it('clears store that has old rollupAddress format but no dbVersion', async () => {
        // Simulate old store format: has rollupAddress singleton but no dbVersion
        const oldRollupSingleton = store.openSingleton<string>('rollupAddress');
        await oldRollupSingleton.set(rollupAddress.toString());

        const testMap = store.openMap<string, string>('test');
        await testMap.set('key', 'value');

        // Init with new version management should clear the old data
        await initStoreForRollupAndSchemaVersion(store, schemaVersion, rollupAddress, mockLogger);

        expect(await testMap.getAsync('key')).toBeUndefined();

        const versionSingleton = store.openSingleton<string>('dbVersion');
        const stored = await versionSingleton.getAsync();
        const storedVersion = DatabaseVersion.fromBuffer(Buffer.from(stored!, 'utf-8'));
        expect(storedVersion.schemaVersion).toBe(schemaVersion);
        expect(storedVersion.rollupAddress.toString()).toBe(rollupAddress.toString());
      });

      it('clears store with old format even if rollup address matches', async () => {
        // Old format with same rollup address
        const oldRollupSingleton = store.openSingleton<string>('rollupAddress');
        await oldRollupSingleton.set(rollupAddress.toString());

        const testMap = store.openMap<string, string>('test');
        await testMap.set('key', 'value');

        await initStoreForRollupAndSchemaVersion(store, schemaVersion, rollupAddress, mockLogger);

        expect(await testMap.getAsync('key')).toBeUndefined();
      });
    });
  });
});
