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

describe('PXE schema compatibility', () => {
  it('matches snapshots stores opened by PXE', async () => {
    const inner = await openTmpStore('pxe-schema-stores', true);
    try {
      const { store, openedStores } = createStoreSpy(inner);

      openPxeStores(store);

      // Embed PXE_DATA_SCHEMA_VERSION alongside the store list so a schema change
      // that updates this snapshot also pins the version it was taken at. Reviewers
      // see the version next to the new store list in the diff.
      expect({ schemaVersion: PXE_DATA_SCHEMA_VERSION, stores: openedStores() }).toMatchSnapshot();
    } finally {
      await inner.close();
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

        // Embed PXE_DATA_SCHEMA_VERSION alongside the buffer so a fixture change
        // that updates this snapshot also pins the version it was taken at. Reviewers
        // see the version next to the new bytes in the diff.
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

  it('pins PXE_DATA_SCHEMA_VERSION', () => {
    // Standalone tripwire that fires whenever the constant changes. Combined with the
    // schemaVersion embedded in the prior tests' snapshots, a schema change requires the
    // developer to bump the version visibly in the diff: the embedded values reveal
    // unbumped versions even after a `-u`. Mechanical enforcement that bumping the schema
    // *requires* bumping the version is not possible with snapshot tests alone — this is
    // a visibility tool, not a hard gate. PR review remains the backstop.
    expect({ PXE_DATA_SCHEMA_VERSION }).toMatchSnapshot();
  });
});
