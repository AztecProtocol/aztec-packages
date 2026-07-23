import { EthAddress } from '@aztec/foundation/eth-address';
import { KeyStore } from '@aztec/key-store';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { GENESIS_BLOCK_HEADER_HASH } from '@aztec/stdlib/block';

import { mkdtemp, rm } from 'fs/promises';
import { toMatchFile } from 'jest-file-snapshot';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { openStore } from '../../entrypoints/server/store.js';
import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { openPxeStores } from '../open_pxe_stores.js';
import { SCHEMA_TESTS } from './schema_tests.js';
import { createStoreSpy } from './store_spy.js';

// These somewhat arcane lines allow us to trigger snapshot comparisons to multiple different snapshot files from this
// single file. We could have instead had individual test files per store, but that made it harder to tie the suite
// together: we wanted to structure this in such a way that we not only snapshot individual stores, but also so we
// detect whether the list of stores PXE uses changed, and whether snapshot test for each element in said list exists.
expect.extend({ toMatchFile });
const __dirname = dirname(fileURLToPath(import.meta.url));
// The last schema in which the key store still persisted the message-signing and fallback secret keys.
const PRE_MESSAGE_AND_FALLBACK_SECRET_KEY_REMOVAL_PXE_SCHEMA_VERSION = 10;

/**
 * Asserts that `value` matches the per-store snapshot file `__snapshots__/<name>.json`. Each store gets its own file
 * so a `-u` regeneration produces a localized git diff: an unrelated store accidentally drifting will show up as a
 * separately-modified file in the diff, instead of being masked inside one consolidated snapshot.
 *
 * On mismatch, prepends domain-specific guidance to the matcher's failure message so a developer who stumbles onto a
 * red CI doesn't reflexively run `-u`: the "right" action depends on whether the gatekeeper or a per-store test
 * failed, and in both cases requires a deliberate decision (add a `SCHEMA_TESTS` entry; bump
 * `PXE_DATA_SCHEMA_VERSION`) that `-u` alone cannot make on the dev's behalf.
 */
function expectMatchesSnapshot(value: unknown, name: string) {
  const snapshotPath = join(__dirname, '__snapshots__', `${name}.json`);
  // We go through some extra ceremony here to bump `snapshotState.matched` on a successful no-op match so the test
  // run's `Snapshots: X passed` total reflects each per-store check. `jest-file-snapshot` only increments
  // `added`/`updated`/`unmatched`; without this bump, passing schema-compat assertions are invisible in the suite's
  // snapshot summary, which would let a maintainer mistake a green run for "backwards compatibility tests not wired
  // up".
  const { snapshotState } = expect.getState();
  const before = { added: snapshotState.added, updated: snapshotState.updated, unmatched: snapshotState.unmatched };
  // Trailing newline matches what the project's post-edit formatter writes to JSON files. Without it, our serialized
  // output and the on-disk file disagree by one byte after every formatter pass, producing perpetual false drift.
  try {
    expect(JSON.stringify(value, null, 2) + '\n').toMatchFile(snapshotPath);
  } catch (err) {
    if (err instanceof Error) {
      err.message = `${compatibilityTestGuidance(name)}\n\n${err.message}`;
    }
    throw err;
  }
  if (
    snapshotState.added === before.added &&
    snapshotState.updated === before.updated &&
    snapshotState.unmatched === before.unmatched
  ) {
    snapshotState.matched++;
  }
}

/**
 * Returns the actionable header to prepend to a snapshot-mismatch failure. Branches on whether the gatekeeper
 * (`opened_stores`) or a specific store's snapshot mismatched, because the corrective actions are different: a
 * gatekeeper failure usually means a `SCHEMA_TESTS` entry is missing for a newly-wired store; a per-store failure
 * means the on-disk format has changed and the dev needs to decide whether the change is breaking (requires a
 * `PXE_DATA_SCHEMA_VERSION` bump) or read-defaultable (no bump).
 */
function compatibilityTestGuidance(name: string): string {
  if (name === 'opened_stores') {
    return [
      '=== PXE storage compatibility ===',
      'The set of kv-stores opened by PXE has changed (stores added, removed, or renamed).',
      '',
      'If unexpected: investigate the diff below.',
      '',
      'If intentional, take these steps in order:',
      '  1. Determine whether the change is BREAKING or READ-DEFAULTABLE:',
      '       - If BREAKING (e.g., a sub-store was renamed or removed; existing data becomes inaccessible):',
      '         bump PXE_DATA_SCHEMA_VERSION in pxe/src/storage/metadata.ts. The schema version is part of the',
      '         store identity, so bumping it selects a fresh store on next open (existing data is left on disk,',
      '         unread); without this bump, existing wallets see corrupted data with no migration path.',
      '       - If READ-DEFAULTABLE (e.g., a new sub-store was added; existing data continues to work because',
      '         the new sub-store starts empty for pre-existing DBs and is populated as new events arrive):',
      '         leave PXE_DATA_SCHEMA_VERSION alone, but document the reasoning in the commit/PR description.',
      '  2. Regenerate ONLY the inventory snapshot (opened_stores.json). From the yarn-project directory, run:',
      "         yarn workspace @aztec/pxe test src/storage/backwards_compatibility_tests/pxe_db_compatibility.test.ts -u -t 'opens the expected set of stores'",
      "     The `-u` flag is Jest's --updateSnapshot; the `-t '<pattern>'` flag scopes the update to the matching",
      '     test. Without `-t`, this command would also rewrite any per-store snapshots that happened to have drifted',
      '     in the same change, masking unrelated regressions under your intentional inventory change.',
      '  3. Run `git status` and verify only opened_stores.json was modified (plus metadata.ts if BREAKING).',
    ].join('\n');
  }
  return [
    `=== PXE storage compatibility (${name}) ===`,
    `The bytes ${name} writes to disk no longer match the committed snapshot ${name}.json.`,
    '',
    `If unintentional: the regression is in the most recent ${name} code changes. Fix the code; do NOT update`,
    'the snapshot. The diff below tells you what changed.',
    '',
    'If intentional (deliberate on-disk format change):',
    '  1. Determine whether the change is BREAKING or READ-DEFAULTABLE:',
    '       - BREAKING: existing on-device databases become unreadable or semantically wrong under the new',
    '         code. Examples: a renamed key, a removed field, an encoding change, a semantic change a read',
    "         path can't transparently default.",
    '       - READ-DEFAULTABLE: the new code reads existing data correctly because of explicit fallbacks.',
    '         Examples: a new key whose absence resolves to a sentinel (genesis, undefined, etc.); a new',
    '         field with a safe default. Existing wallets continue working after upgrade and the on-disk',
    '         state self-heals as new events arrive.',
    '  2. If BREAKING: bump PXE_DATA_SCHEMA_VERSION in pxe/src/storage/metadata.ts. The schema version is',
    '     part of the store identity, so bumping it selects a fresh store on next open (existing data is left',
    '     on disk, unread); without this bump, existing wallets see corrupted data with no migration path.',
    '     If READ-DEFAULTABLE: leave PXE_DATA_SCHEMA_VERSION alone, but document the reasoning in the',
    '     commit/PR description (which fallback applies, where, and what state pre-upgrade DBs converge to).',
    `  3. Regenerate ONLY ${name}.json. From the yarn-project directory, run:`,
    `         yarn workspace @aztec/pxe test src/storage/backwards_compatibility_tests/pxe_db_compatibility.test.ts -u -t '${name} compatibility test'`,
    "     The `-u` flag is Jest's --updateSnapshot; the `-t '<pattern>'` flag scopes the update to the matching",
    '     test. Without `-t`, the command would also rewrite any other per-store snapshots that happened to have',
    `     drifted in the same change, masking unrelated regressions under your intentional ${name} change.`,
    `  4. Run \`git status\` and verify only ${name}.json was modified (plus metadata.ts if BREAKING, plus`,
    '     opened_stores.json if the inventory changed).',
  ].join('\n');
}

/**
 * Spies on `openPxeStores` and returns the canonical list of sub-stores PXE opens. Used by both the inventory test
 * (to fingerprint that list) and the coverage test (to compare it against what SCHEMA_TESTS fingerprints).
 */
async function collectOpenedStores() {
  const kvStore = await openTmpStore('pxe-schema-stores', true);
  try {
    const spy = createStoreSpy(kvStore);
    openPxeStores(spy.store, GENESIS_BLOCK_HEADER_HASH);
    return spy.getOpenedStores();
  } finally {
    await kvStore.close();
  }
}

/**
 * Seeds rows into a `pxe_data` store opened at `oldSchemaVersion`, then opens the store for the current
 * `PXE_DATA_SCHEMA_VERSION`. The schema version is part of the store identity, so the current version selects a
 * fresh store: `assertNotRead` proves the legacy rows are invisible to new code, and `assertLegacyIntact` proves
 * they still exist untouched in the old schema's own store.
 */
async function expectFreshStoreSelectedOnUpgradeFrom(
  oldSchemaVersion: number,
  seedLegacyRows: (oldStore: AztecAsyncKVStore) => Promise<void>,
  assertNotRead: (currentStore: AztecAsyncKVStore) => Promise<void>,
  assertLegacyIntact: (oldStore: AztecAsyncKVStore) => Promise<void>,
) {
  const dataDirectory = await mkdtemp(join(tmpdir(), 'pxe-schema-upgrade-'));
  const config = {
    dataDirectory,
    dataStoreMapSizeKb: 1024,
    l1ChainId: 31337,
    rollupAddress: EthAddress.ZERO,
  };

  try {
    const oldStore = await openStore('pxe_data', oldSchemaVersion, config);
    try {
      await seedLegacyRows(oldStore);
    } finally {
      await oldStore.close();
    }

    const currentStore = await openStore('pxe_data', PXE_DATA_SCHEMA_VERSION, config);
    try {
      await assertNotRead(currentStore);
    } finally {
      await currentStore.close();
    }

    const reopenedOldStore = await openStore('pxe_data', oldSchemaVersion, config);
    try {
      await assertLegacyIntact(reopenedOldStore);
    } finally {
      await reopenedOldStore.close();
    }
  } finally {
    await rm(dataDirectory, { recursive: true, force: true, maxRetries: 3 });
  }
}

/**
 * Backwards-compatibility test suite for PXE storage. The intent is to detect any change to the bytes PXE writes to
 * disk that would render existing on-device data unreadable after a version bump. Each schema test (in
 * `schema_tests.ts`) drives the production write path of one store class, then snapshots every sub-store the class
 * opens.
 *
 * Three layers of checks run against `SCHEMA_TESTS`:
 *
 *   - "opens the expected set of stores" (inventory): snapshots the names PXE opens through `openPxeStores`. Adds,
 *     removes, and renames of sub-stores fail this first.
 *   - "every opened sub-store has SCHEMA_TESTS coverage" (coverage): every sub-store from the inventory must also
 *     be opened by at least one `snapshotStore` callback in `SCHEMA_TESTS`. Without this, a new sub-store could be
 *     added to PXE without any snapshot tripwire ever fingerprinting it.
 *   - per-store compatibility (`<StoreName> compatibility test`): drives the production write path for one store
 *     class and compares the resulting bytes to a committed per-store snapshot.
 */
describe('PXE storage compatibility test suite', () => {
  it('never reads key-store rows written under an older schema version, and leaves them intact', async () => {
    const account = AztecAddress.fromStringUnsafe('0x0b3683ee9df3ed6ed7027145bd6093f783b0bb4d8354501d906db7bb8cb58ea3');
    const ivskKey = `${account.toString()}-ivsk_m`;
    const ivskValue = Buffer.from('1fb01c42d1aaa2662041b899c77cb19e08192193acc5a94405f1b43c974eba7a', 'hex');
    await expectFreshStoreSelectedOnUpgradeFrom(
      PRE_MESSAGE_AND_FALLBACK_SECRET_KEY_REMOVAL_PXE_SCHEMA_VERSION,
      oldStore => oldStore.openMap<string, Buffer>('key_store').set(ivskKey, ivskValue),
      async currentStore => {
        const keyStore = new KeyStore(currentStore);
        await expect(keyStore.hasAccount(account)).resolves.toBe(false);
      },
      async oldStore => {
        expect(await oldStore.openMap<string, Buffer>('key_store').getAsync(ivskKey)).toEqual(ivskValue);
      },
    );
  });

  it('opens the expected set of stores', async () => {
    const openedStores = await collectOpenedStores();
    expectMatchesSnapshot({ schemaVersion: PXE_DATA_SCHEMA_VERSION, stores: openedStores }, 'opened_stores');
  });

  it('every opened sub-store has SCHEMA_TESTS coverage', async () => {
    const openedStores = await collectOpenedStores();

    // Spy on each test's `snapshotStore` to record which sub-stores it opens.
    const covered = new Set<string>();
    for (const t of SCHEMA_TESTS) {
      const kvStore = await openTmpStore(`pxe-schema-coverage-${t.name}`, true);
      try {
        const coverageSpy = createStoreSpy(kvStore);
        await t.snapshotStore(coverageSpy.store);
        coverageSpy.getOpenedStores().forEach(e => covered.add(`${e.kind}:${e.name}`));
      } finally {
        await kvStore.close();
      }
    }

    const uncovered = openedStores.map(e => `${e.kind}:${e.name}`).filter(n => !covered.has(n));
    if (uncovered.length > 0) {
      throw new Error(
        [
          '=== PXE storage compatibility (coverage) ===',
          'The following sub-stores are opened by openPxeStores but not fingerprinted by any SCHEMA_TESTS',
          `snapshotStore callback: ${uncovered.join(', ')}.`,
          '',
          'Without coverage, future schema changes to these sub-stores go undetected. To fix:',
          '  1. Find which store class opens the missing sub-store. Store classes live under',
          '     pxe/src/storage/<store-name>/<store-name>.ts. From the yarn-project directory, grep that',
          '     directory for the sub-store name (e.g. `grep -rn "\'last_finalized_indexes\'" pxe/src/storage`).',
          "  2. In schema_tests.ts, find that store class's entry in the SCHEMA_TESTS array. Add a",
          '     line to its `snapshotStore` callback that re-reads the sub-store. Look at sibling entries for the',
          '     pattern; for example:',
          "         last_finalized_indexes: await snapshotMap(kvStore.openMap<string, number>('last_finalized_indexes')),",
          '     Use snapshotMap / snapshotArray / snapshotSingleton according to the sub-store',
          '     kind shown above (`map:`, `multimap:`, `array:`, `singleton:`).',
          '  3. Regenerate ONLY the affected per-store snapshot. From the yarn-project directory, run:',
          "         yarn workspace @aztec/pxe test src/storage/backwards_compatibility_tests/pxe_db_compatibility.test.ts -u -t '<StoreName> compatibility test'",
          '     (Replace <StoreName> with the store class name from step 1.) The newly-fingerprinted sub-store',
          "     will appear as an additional key in the regenerated <StoreName>.json. The `-t '<pattern>'` flag",
          '     keeps the update surgical so unrelated drift does not get accepted alongside your fix.',
        ].join('\n'),
      );
    }
  });

  // For each `SchemaTest` entry, drive its `writeToStore` against a fresh kv-store, render the resulting bytes via
  // its `snapshotStore`, and compare to the committed per-store snapshot file under `__snapshots__/<name>.json`.
  for (const t of SCHEMA_TESTS) {
    describe(t.name, () => {
      it(`${t.name} compatibility test`, async () => {
        const kvStore = await openTmpStore(`pxe-schema-${t.name}`, true);
        try {
          await t.writeToStore(kvStore);
          const data = await t.snapshotStore(kvStore);
          expectMatchesSnapshot(data, t.name);
        } finally {
          await kvStore.close();
        }
      });
    });
  }
});
