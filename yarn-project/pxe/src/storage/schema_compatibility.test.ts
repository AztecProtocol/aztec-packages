import { openTmpStore } from '@aztec/kv-store/lmdb-v2';

import { assertNoDefaultFields } from './__schema_fixtures__/assert_no_default_fields.js';
import { SCHEMA_FIXTURES } from './__schema_fixtures__/fixtures.js';
import { createStoreSpy } from './__schema_fixtures__/store_spy.js';
import { PXE_DATA_SCHEMA_VERSION } from './metadata.js';
import { openPxeStores } from './open_pxe_stores.js';

/**
 * Maps the names of stores that hold PXE-defined value-types to the corresponding fixture type name.
 * Stores not listed here either hold foundation/stdlib types (out of fixture scope) or primitives.
 */
const STORE_NAME_TO_FIXTURE_TYPE: ReadonlyMap<string, string> = new Map([
  ['notes', 'StoredNote'],
  ['private_event_logs', 'StoredPrivateEvent'],
  ['contract_classes', 'SerializableContractClassData'],
  ['contracts_instances', 'SerializableContractInstance'],
]);

/**
 * PXE wipes its database when `PXE_DATA_SCHEMA_VERSION` doesn't match what's on disk, so any
 * uncoordinated change to the on-disk schema destroys user data. These tests pin the schema
 * fingerprint (set of opened stores + binary layout of every stored type) so a schema change
 * forces a visible diff.
 *
 * The `schemaVersion` field embedded in each snapshot is a visibility tool, not a hard gate: a
 * developer running `-u` picks up new bytes alongside the unchanged version, making it obvious
 * in PR review that the constant should be bumped. Mechanical enforcement of "schema change
 * requires version bump" is not possible with snapshot tests alone — PR review is the backstop.
 */
describe('PXE schema compatibility', () => {
  it('matches snapshots stores opened by PXE', async () => {
    const kvStore = await openTmpStore('pxe-schema-stores', true);
    try {
      const { store, openedStores } = createStoreSpy(kvStore);
      openPxeStores(store);
      expect({ schemaVersion: PXE_DATA_SCHEMA_VERSION, stores: openedStores() }).toMatchSnapshot();
    } finally {
      await kvStore.close();
    }
  });

  it('pins the binary layout of each stored value-type', () => {
    for (const [typeName, builder] of SCHEMA_FIXTURES) {
      const first = builder();
      const second = builder();

      expect(first.length).toBe(second.length);

      for (let i = 0; i < first.length; i++) {
        const variant = first[i];
        const variantSecond = second[i];
        const buf = variant.toBuffer();
        const bufSecond = variantSecond.toBuffer();

        // Determinism: two consecutive runs must produce identical bytes.
        if (!buf.equals(bufSecond)) {
          throw new Error(
            `Fixture for ${typeName} (variant ${i}) is non-deterministic — ` +
              `it produced different bytes on two consecutive runs. ` +
              `Replace random/time/UUID calls with deterministic values.`,
          );
        }

        // Fixture completeness heuristic — variant 0 only.
        // Subsequent variants explicitly test edge cases (e.g. Optional fields' None branch)
        // and may legitimately leave a field at its default sentinel.
        if (i === 0) {
          assertNoDefaultFields(`${typeName} (variant ${i})`, variant);
        }

        expect({
          schemaVersion: PXE_DATA_SCHEMA_VERSION,
          type: typeName,
          variant: i,
          length: buf.length,
          hex: buf.toString('hex'),
        }).toMatchSnapshot();
      }
    }
  });

  it('has a fixture for every PXE-typed store and a store for every fixture', async () => {
    const inner = await openTmpStore('pxe-schema-cross-check', true);
    try {
      const { store, openedStores } = createStoreSpy(inner);

      openPxeStores(store);

      const openedStoreNames = new Set(openedStores().map(e => e.name));
      const fixtureTypeNames = new Set(SCHEMA_FIXTURES.keys());

      const storesWithoutFixtures: string[] = [];
      for (const [storeName, expectedFixtureType] of STORE_NAME_TO_FIXTURE_TYPE) {
        if (!openedStoreNames.has(storeName)) {
          storesWithoutFixtures.push(`${storeName} (not opened by PXE)`);
        } else if (!fixtureTypeNames.has(expectedFixtureType)) {
          storesWithoutFixtures.push(`${storeName} -> ${expectedFixtureType} (no fixture)`);
        }
      }

      const mappedFixtureTypes = new Set(STORE_NAME_TO_FIXTURE_TYPE.values());
      const fixturesWithoutStores: string[] = [];
      for (const fixtureType of fixtureTypeNames) {
        if (!mappedFixtureTypes.has(fixtureType)) {
          fixturesWithoutStores.push(`${fixtureType} (not mapped to any store)`);
        }
      }

      expect({
        storesWithoutFixtures: storesWithoutFixtures.sort(),
        fixturesWithoutStores: fixturesWithoutStores.sort(),
      }).toMatchSnapshot();
    } finally {
      await inner.close();
    }
  });
});
