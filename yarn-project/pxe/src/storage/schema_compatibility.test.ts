import { KeyStore } from '@aztec/key-store';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';

import { assertNoDefaultFields } from './__schema_fixtures__/assert_no_default_fields.js';
import { SCHEMA_FIXTURES } from './__schema_fixtures__/fixtures.js';
import { createStoreSpy } from './__schema_fixtures__/store_spy.js';
import { AddressStore } from './address_store/address_store.js';
import { AnchorBlockStore } from './anchor_block_store/anchor_block_store.js';
import { CapsuleStore } from './capsule_store/capsule_store.js';
import { ContractStore } from './contract_store/contract_store.js';
import { PXE_DATA_SCHEMA_VERSION } from './metadata.js';
import { NoteStore } from './note_store/note_store.js';
import { PrivateEventStore } from './private_event_store/private_event_store.js';
import { RecipientTaggingStore, SenderAddressBookStore, SenderTaggingStore } from './tagging_store/index.js';

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

function constructAllPxeSubStores(store: AztecAsyncKVStore): void {
  // Mirror pxe.ts:216-226 exactly. Any store added there must be added here.
  new AddressStore(store);
  new PrivateEventStore(store);
  new ContractStore(store);
  new NoteStore(store);
  new AnchorBlockStore(store);
  new SenderTaggingStore(store);
  new SenderAddressBookStore(store);
  new RecipientTaggingStore(store);
  new CapsuleStore(store);
  new KeyStore(store);
  new L2TipsKVStore(store, 'pxe');
}

describe('pxe schema compatibility', () => {
  it('pins the set of opened stores', async () => {
    const inner = await openTmpStore('pxe-schema-stores', true);
    try {
      const { store, log } = createStoreSpy(inner);

      constructAllPxeSubStores(store);

      const sorted = [...log].sort((a, b) =>
        a.name === b.name ? a.kind.localeCompare(b.kind) : a.name.localeCompare(b.name),
      );
      expect(sorted).toMatchSnapshot();
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

        expect({
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
      const { store, log } = createStoreSpy(inner);

      constructAllPxeSubStores(store);

      const openedStoreNames = new Set(log.map(e => e.name));
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

  it('couples version bumps to schema changes', () => {
    // The legitimate-update path for any of the prior snapshots is to bump PXE_DATA_SCHEMA_VERSION
    // *and* update this snapshot in the same commit. That makes the wipe-on-upgrade mechanism honest:
    // a developer who legitimately changes the schema must consciously trigger the wipe.
    expect({ PXE_DATA_SCHEMA_VERSION }).toMatchSnapshot();
  });
});
