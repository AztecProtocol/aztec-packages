/* eslint-disable camelcase */
import { CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, PRIVATE_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Tuple } from '@aztec/foundation/serialize';
import { KeyStore } from '@aztec/key-store';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/lmdb-v2';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { type ContractArtifact, EventSelector, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { PublicDataWrite, RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, Body, L2Block } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { CompleteAddress, SerializableContractInstance } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import { PublicKeys } from '@aztec/stdlib/keys';
import {
  ContractClassLog,
  ContractClassLogFields,
  ExtendedDirectionalAppTaggingSecret,
  PrivateLog,
  PublicLog,
  type TaggingIndexRange,
} from '@aztec/stdlib/logs';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  GlobalVariables,
  PartialStateReference,
  StateReference,
  TxEffect,
  TxHash,
} from '@aztec/stdlib/tx';

import { toMatchFile } from 'jest-file-snapshot';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { AddressStore } from '../address_store/address_store.js';
import { AnchorBlockStore } from '../anchor_block_store/anchor_block_store.js';
import { CapsuleStore } from '../capsule_store/capsule_store.js';
import { ContractStore } from '../contract_store/contract_store.js';
import { PXE_DATA_SCHEMA_VERSION } from '../metadata.js';
import { NoteStore } from '../note_store/note_store.js';
import { openPxeStores } from '../open_pxe_stores.js';
import { PrivateEventStore } from '../private_event_store/private_event_store.js';
import { RecipientTaggingStore, SenderAddressBookStore, SenderTaggingStore } from '../tagging_store/index.js';
import { snapshotArray, snapshotMap, snapshotMultiMap, snapshotSingleton } from './kv_store_snapshot.js';
import { createStoreSpy } from './store_spy.js';

// These somewhat arcane lines allow us to trigger snapshot comparisons to multiple different snapshot files from this
// single file. We could have instead had individual test files per store, but that made it harder to tie the suite
// together: we wanted to structure this in such a way that we not only snapshot individual stores, but also so we
// detect whether the list of stores PXE uses changed, and whether snapshot test for each element in said list exists.
expect.extend({ toMatchFile });
const __dirname = dirname(fileURLToPath(import.meta.url));

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
      '=== PXE storage compatibility (gatekeeper) ===',
      'The set of kv-stores opened by PXE has changed.',
      '',
      'If unexpected: investigate the diff below.',
      '',
      'If intentional, take these steps in order:',
      '  1. If a new store was added: add a corresponding entry to the SCHEMA_TESTS array in this file',
      '     (pxe_db_compatibility.test.ts). This is needed to prove that we are providing backwards',
      '     compatibility tests for all kv-stores effectively used by PXE.',
      '  2. Determine whether the inventory change is BREAKING or READ-DEFAULTABLE:',
      '       - If BREAKING (e.g., a sub-store was renamed or removed; existing data becomes inaccessible):',
      '         bump PXE_DATA_SCHEMA_VERSION in pxe/src/storage/metadata.ts. DatabaseVersionManager wipes any',
      '         DB whose stored version is below the current one when it next opens; without this bump,',
      '         existing wallets see corrupted data with no migration path.',
      '       - If READ-DEFAULTABLE (e.g., a new sub-store was added; existing data continues to work because',
      '         the new sub-store starts empty for pre-existing DBs and is populated as new events arrive):',
      '         leave PXE_DATA_SCHEMA_VERSION alone, but document the reasoning in the commit/PR description.',
      '  3. Regenerate ONLY the gatekeeper snapshot (opened_stores.json). From the yarn-project directory, run:',
      "         yarn workspace @aztec/pxe test src/storage/backwards_compatibility_tests/pxe_db_compatibility.test.ts -u -t 'opens the expected'",
      "     The `-u` flag is Jest's --updateSnapshot; the `-t '<pattern>'` flag scopes the update to the matching",
      '     test. Without `-t`, this command would also rewrite any per-store snapshots that happened to have drifted',
      '     in the same change, masking unrelated regressions under your intentional inventory change.',
      '  4. Run `git status` and verify only opened_stores.json was modified (plus metadata.ts if BREAKING).',
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
    '  2. If BREAKING: bump PXE_DATA_SCHEMA_VERSION in pxe/src/storage/metadata.ts. DatabaseVersionManager',
    '     wipes any DB whose stored version is below the current one when it next opens; without this bump,',
    '     existing wallets see corrupted data with no migration path.',
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
 * Backwards-compatibility test suite for PXE storage. The intent is to detect any change to the bytes PXE writes to
 * disk that would render existing on-device data unreadable after a version bump. Each `SCHEMA_TESTS` entry drives the
 * production write path of one store class, then snapshots every sub-store the class opens.
 *
 * The gatekeeper test ("opens the expected set of stores") fingerprints the inventory of kv-stores that
 * `openPxeStores` opens. Whenever a new store is added or wired into PXE, that snapshot fails first; the developer is
 * then expected to add a corresponding entry to `SCHEMA_TESTS` covering the new store's sub-stores.
 */

/**
 * Template of a specific store's backwards compatibility checks.
 *
 * 1. `name` is the store's name (`AddressStore`, `NoteStore`, etc).
 * 2. `writeToStore` drives writes through each store's own production API (`addNote`, `setCapsule`, etc).
 * 3. `snapshotStore` re-opens the underlying kv-stores by name (raw) and renders them as snapshots.
 */
type SchemaTest = {
  name: string;
  writeToStore: (kvStore: AztecAsyncKVStore) => Promise<void>;
  snapshotStore: (kvStore: AztecAsyncKVStore) => Promise<Record<string, unknown>>;
};

const SCHEMA_TESTS: readonly SchemaTest[] = [
  {
    name: 'AddressStore',
    writeToStore: async kvStore => {
      const addressStore = new AddressStore(kvStore);

      const addresses = [
        await CompleteAddress.fromSecretKeyAndPartialAddress(new Fr(2n), new Fr(3n)),
        await CompleteAddress.fromSecretKeyAndPartialAddress(new Fr(5n), new Fr(7n)),
      ];

      await addressStore.addCompleteAddress(addresses[0]);
      await addressStore.addCompleteAddress(addresses[1]);
      // Re-adding an already-registered address must be a no-op: duplicate detection should leave both sub-stores
      // unchanged. If this regresses, the snapshot picks up an extra array entry.
      await addressStore.addCompleteAddress(addresses[0]);
    },
    snapshotStore: async kvStore => ({
      complete_addresses: await snapshotArray(kvStore.openArray<Buffer>('complete_addresses')),
      complete_address_index: await snapshotMap(kvStore.openMap<string, number>('complete_address_index')),
    }),
  },

  {
    name: 'AnchorBlockStore',
    writeToStore: async kvStore => {
      const anchorBlockStore = new AnchorBlockStore(kvStore);

      // Each primitive field gets a distinct prime so any reorder shows up in the snapshot diff. An all-zero
      // `BlockHeader.empty()` would silently pass through same-width field swaps.
      await anchorBlockStore.setHeader(
        new BlockHeader(
          new AppendOnlyTreeSnapshot(new Fr(2n), 3),
          new StateReference(
            new AppendOnlyTreeSnapshot(new Fr(5n), 7),
            new PartialStateReference(
              new AppendOnlyTreeSnapshot(new Fr(11n), 13),
              new AppendOnlyTreeSnapshot(new Fr(17n), 19),
              new AppendOnlyTreeSnapshot(new Fr(23n), 29),
            ),
          ),
          new Fr(31n),
          new GlobalVariables(
            new Fr(37n),
            new Fr(41n),
            BlockNumber(43),
            SlotNumber(47),
            53n,
            EthAddress.fromField(new Fr(59n)),
            AztecAddress.fromBigInt(61n),
            new GasFees(67n, 71n),
          ),
          new Fr(73n),
          new Fr(79n),
        ),
      );
    },
    snapshotStore: async kvStore => ({
      header: await snapshotSingleton(kvStore.openSingleton<Buffer>('header')),
    }),
  },

  {
    name: 'CapsuleStore',
    writeToStore: async kvStore => {
      const capsuleStore = new CapsuleStore(kvStore);

      const jobId = 'fixture-job';
      const contractAddress = AztecAddress.fromBigInt(2n);
      const scope = AztecAddress.fromBigInt(3n);

      // Three setCapsule calls (2-element, 1-element, 0-element value vector) pin every value-encoding length case.
      capsuleStore.setCapsule(contractAddress, new Fr(5n), [new Fr(7n), new Fr(11n)], jobId, scope);
      capsuleStore.setCapsule(contractAddress, new Fr(13n), [new Fr(17n)], jobId, scope);
      capsuleStore.setCapsule(contractAddress, new Fr(19n), [], jobId, scope);
      await kvStore.transactionAsync(() => capsuleStore.commit(jobId));
    },
    snapshotStore: async kvStore => ({
      capsules: await snapshotMap(kvStore.openMap<string, Buffer>('capsules')),
    }),
  },

  {
    name: 'ContractStore',
    writeToStore: async kvStore => {
      const contractStore = new ContractStore(kvStore);

      // Hand-rolled artifact (see `buildSchemaContractArtifact` below) instead of importing a noir-compiled fixture.
      // The compiled fixture's JSON contains noir-compiler outputs (error-type hashes, debug symbols, struct paths)
      // that drift across compiler versions and produce spurious ContractStore.json diffs that have nothing to do with
      // PXE's on-disk schema. The hand-rolled artifact is small, deterministic across versions, and exercises the
      // `addContractArtifact` write path identically.
      const artifact = buildSchemaContractArtifact();

      // Precomputed class so the `contract_classes` bytes are hardcoded by this test rather than derived from
      // `getContractClassFromArtifact`.
      const populatedClass = {
        version: 1 as const,
        id: new Fr(2n),
        artifactHash: new Fr(3n),
        privateFunctionsRoot: new Fr(5n),
        publicBytecodeCommitment: new Fr(7n),
        privateFunctions: [
          { selector: FunctionSelector.fromField(new Fr(11n)), vkHash: new Fr(13n) },
          { selector: FunctionSelector.fromField(new Fr(17n)), vkHash: new Fr(19n) },
        ],
        packedBytecode: Buffer.alloc(0),
      };

      await contractStore.addContractArtifact(artifact, populatedClass);

      // Same artifact, different class with empty `privateFunctions`. Tests zero-length-vector encoding for the
      // privateFunctions field, which the populated case can't reach.
      await contractStore.addContractArtifact(artifact, {
        version: 1 as const,
        id: new Fr(23n),
        artifactHash: new Fr(29n),
        privateFunctionsRoot: new Fr(31n),
        publicBytecodeCommitment: new Fr(37n),
        privateFunctions: [],
        packedBytecode: Buffer.alloc(0),
      });

      // Re-register the populated class: must hit the `#contractArtifactCache` short-circuit and leave both
      // `contract_artifacts` and `contract_classes` unchanged.
      await contractStore.addContractArtifact(artifact, populatedClass);

      await contractStore.addContractInstance(
        new SerializableContractInstance({
          version: 1,
          salt: new Fr(73n),
          deployer: AztecAddress.fromBigInt(79n),
          currentContractClassId: new Fr(83n),
          originalContractClassId: new Fr(89n),
          initializationHash: new Fr(97n),
          publicKeys: new PublicKeys(
            new Point(new Fr(41n), new Fr(43n), false),
            new Point(new Fr(47n), new Fr(53n), false),
            new Point(new Fr(59n), new Fr(61n), false),
            new Point(new Fr(67n), new Fr(71n), false),
          ),
        }).withAddress(AztecAddress.fromBigInt(101n)),
      );
    },
    snapshotStore: async kvStore => ({
      contract_artifacts: await snapshotMap(kvStore.openMap<string, Buffer>('contract_artifacts')),
      contract_classes: await snapshotMap(kvStore.openMap<string, Buffer>('contract_classes')),
      contracts_instances: await snapshotMap(kvStore.openMap<string, Buffer>('contracts_instances')),
    }),
  },

  {
    name: 'KeyStore',
    writeToStore: async kvStore => {
      const keyStore = new KeyStore(kvStore);
      await keyStore.addAccount(new Fr(2n), new Fr(3n));
    },
    snapshotStore: async kvStore => ({
      key_store: await snapshotMap(kvStore.openMap<string, Buffer>('key_store')),
    }),
  },

  {
    name: 'L2TipsKVStore',
    writeToStore: async kvStore => {
      const l2TipsStore = new L2TipsKVStore(kvStore, 'pxe');

      const block = buildL2Block();
      const publishedCheckpoint = new PublishedCheckpoint(
        new Checkpoint(
          new AppendOnlyTreeSnapshot(new Fr(2n), 3),
          new CheckpointHeader(
            new Fr(5n),
            new Fr(7n),
            new Fr(11n),
            new Fr(13n),
            new Fr(17n),
            SlotNumber(19),
            23n,
            EthAddress.fromField(new Fr(29n)),
            AztecAddress.fromBigInt(31n),
            new GasFees(37n, 41n),
            new Fr(43n),
          ),
          [block],
          CheckpointNumber(47),
          53n,
        ),
        new L1PublishedData(59n, 61n, new Fr(67n).toString()),
        [],
      );

      // `'blocks-added'` writes to `pxe_l2_tips` (proposed tag) and `pxe_l2_block_hashes`.
      // `'chain-checkpointed'` writes to all four sub-stores: tips ('checkpointed' and 'proposedCheckpoint' tags),
      // block-to-checkpoint mapping, and the checkpoint store.
      await l2TipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });
      await l2TipsStore.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        block: { number: BlockNumber(71), hash: new Fr(73n).toString() },
        checkpoint: publishedCheckpoint,
      });
      // `'chain-proven'` writes the 'proven' tag. `'finalized'` is omitted because its handler runs delete-before
      // logic that would depend on the order of preceding events.
      await l2TipsStore.handleBlockStreamEvent({
        type: 'chain-proven',
        block: { number: BlockNumber(79), hash: new Fr(83n).toString() },
      });
    },
    snapshotStore: async kvStore => ({
      pxe_l2_tips: await snapshotMap(kvStore.openMap<string, number>('pxe_l2_tips')),
      pxe_l2_block_hashes: await snapshotMap(kvStore.openMap<number, string>('pxe_l2_block_hashes')),
      pxe_l2_block_number_to_checkpoint_number: await snapshotMap(
        kvStore.openMap<number, number>('pxe_l2_block_number_to_checkpoint_number'),
      ),
      pxe_l2_checkpoint_store: await snapshotMap(kvStore.openMap<number, Buffer>('pxe_l2_checkpoint_store')),
    }),
  },

  {
    name: 'NoteStore',
    writeToStore: async kvStore => {
      const noteStore = new NoteStore(kvStore);

      const jobId = 'fixture-job';

      // Two contracts so `note_nullifiers_by_contract` exhibits both a multi-value row (contractA → {n1, n2}) and a
      // single-value row (contractB → {n3}).
      const contractA = AztecAddress.fromBigInt(2n);
      const contractB = AztecAddress.fromBigInt(3n);
      const scopeX = AztecAddress.fromBigInt(5n);
      const scopeY = AztecAddress.fromBigInt(7n);

      // note1: active, will be added under two scopes to exercise the multi-element scopes vector encoding in
      // `StoredNote.toBuffer`.
      const note1 = new NoteDao(
        new Note([new Fr(13n), new Fr(17n), new Fr(19n)]),
        contractA,
        AztecAddress.fromBigInt(23n),
        new Fr(29n),
        new Fr(31n),
        new Fr(37n),
        new Fr(41n),
        new Fr(43n),
        TxHash.fromField(new Fr(47n)),
        BlockNumber(53),
        new Fr(59n).toString(),
        61,
        67,
      );

      // note2: same contract as note1 → produces the multi-value row in `note_nullifiers_by_contract`.
      const note2 = new NoteDao(
        new Note([new Fr(71n), new Fr(73n), new Fr(79n)]),
        contractA,
        AztecAddress.fromBigInt(83n),
        new Fr(89n),
        new Fr(97n),
        new Fr(101n),
        new Fr(103n),
        new Fr(107n),
        TxHash.fromField(new Fr(109n)),
        BlockNumber(113),
        new Fr(127n).toString(),
        131,
        137,
      );

      // note3: different contract; will be nullified to populate `note_block_number_to_nullifier` and exercise the
      // populated `_nullifiedAt` trailer of `StoredNote.toBuffer`.
      const note3 = new NoteDao(
        new Note([new Fr(139n), new Fr(149n), new Fr(151n)]),
        contractB,
        AztecAddress.fromBigInt(157n),
        new Fr(163n),
        new Fr(167n),
        new Fr(173n),
        new Fr(179n),
        new Fr(181n),
        TxHash.fromField(new Fr(191n)),
        BlockNumber(193),
        new Fr(197n).toString(),
        199,
        211,
      );

      // Adding note1 twice with different scopes triggers `addScope` on the staged StoredNote, producing a 2-element
      // scope vector in the committed buffer.
      await noteStore.addNotes([note1], scopeX, jobId);
      await noteStore.addNotes([note1], scopeY, jobId);
      await noteStore.addNotes([note2], scopeX, jobId);
      await noteStore.addNotes([note3], scopeX, jobId);

      // Nullify note3 within the same job. `applyNullifiers` reads the staged StoredNote, sets `_nullifiedAt`, and
      // writes back to the staged map; `commit` then flushes it to disk with the populated trailer and adds the
      // corresponding `note_block_number_to_nullifier` entry.
      await noteStore.applyNullifiers(
        [{ data: note3.siloedNullifier, l2BlockNumber: BlockNumber(223), l2BlockHash: BlockHash.ZERO }],
        jobId,
      );

      await kvStore.transactionAsync(() => noteStore.commit(jobId));
    },
    snapshotStore: async kvStore => ({
      notes: await snapshotMap(kvStore.openMap<string, Buffer>('notes')),
      note_nullifiers_by_contract: await snapshotMultiMap(
        kvStore.openMultiMap<string, string>('note_nullifiers_by_contract'),
      ),
      note_block_number_to_nullifier: await snapshotMultiMap(
        kvStore.openMultiMap<number, string>('note_block_number_to_nullifier'),
      ),
    }),
  },

  {
    name: 'PrivateEventStore',
    writeToStore: async kvStore => {
      const privateEventStore = new PrivateEventStore(kvStore);

      const jobId = 'fixture-job';

      // Two (contract, selector) pairs and two block numbers so each multimap exhibits both a multi-value row
      // (contractA/selectorA → {e1, e2} and blockN1 → {e1, e2}) and a contrasting single-value row.
      const contractA = AztecAddress.fromBigInt(2n);
      const contractB = AztecAddress.fromBigInt(3n);
      const selectorA = EventSelector.fromField(new Fr(5n));
      const selectorB = EventSelector.fromField(new Fr(7n));
      const scopeX = AztecAddress.fromBigInt(11n);
      const scopeY = AztecAddress.fromBigInt(13n);
      const blockN1 = BlockNumber(17);
      const blockN2 = BlockNumber(19);

      // event1: rich fixture. Re-stored under scopeY below to exercise the `addScope` branch and produce a 2-element
      // scopes vector in the committed buffer.
      const event1Commitment = new Fr(23n);
      await privateEventStore.storePrivateEventLog(
        selectorA,
        new Fr(29n),
        [new Fr(31n), new Fr(37n), new Fr(41n)],
        event1Commitment,
        {
          contractAddress: contractA,
          scope: scopeX,
          txHash: TxHash.fromField(new Fr(43n)),
          l2BlockNumber: blockN1,
          l2BlockHash: new BlockHash(new Fr(47n)),
          txIndexInBlock: 53,
          eventIndexInTx: 59,
        },
        jobId,
      );

      // Same eventId, different scope: takes the `existing.addScope(...)` path in `storePrivateEventLog`.
      await privateEventStore.storePrivateEventLog(
        selectorA,
        new Fr(29n),
        [new Fr(31n), new Fr(37n), new Fr(41n)],
        event1Commitment,
        {
          contractAddress: contractA,
          scope: scopeY,
          txHash: TxHash.fromField(new Fr(43n)),
          l2BlockNumber: blockN1,
          l2BlockHash: new BlockHash(new Fr(47n)),
          txIndexInBlock: 53,
          eventIndexInTx: 59,
        },
        jobId,
      );

      // event2: same (contract, selector) and same block as event1 → multi-value rows in both multimaps.
      await privateEventStore.storePrivateEventLog(
        selectorA,
        new Fr(61n),
        [new Fr(67n), new Fr(71n), new Fr(73n)],
        new Fr(79n),
        {
          contractAddress: contractA,
          scope: scopeX,
          txHash: TxHash.fromField(new Fr(83n)),
          l2BlockNumber: blockN1,
          l2BlockHash: new BlockHash(new Fr(89n)),
          txIndexInBlock: 97,
          eventIndexInTx: 101,
        },
        jobId,
      );

      // event3: distinct (contract, selector) and block → contrasting single-value multimap rows.
      await privateEventStore.storePrivateEventLog(
        selectorB,
        new Fr(103n),
        [new Fr(107n), new Fr(109n), new Fr(113n)],
        new Fr(127n),
        {
          contractAddress: contractB,
          scope: scopeX,
          txHash: TxHash.fromField(new Fr(131n)),
          l2BlockNumber: blockN2,
          l2BlockHash: new BlockHash(new Fr(137n)),
          txIndexInBlock: 139,
          eventIndexInTx: 149,
        },
        jobId,
      );

      await kvStore.transactionAsync(() => privateEventStore.commit(jobId));
    },
    snapshotStore: async kvStore => ({
      private_event_logs: await snapshotMap(kvStore.openMap<string, Buffer>('private_event_logs')),
      events_by_contract_selector: await snapshotMultiMap(
        kvStore.openMultiMap<string, string>('events_by_contract_selector'),
      ),
      events_by_block_number: await snapshotMultiMap(kvStore.openMultiMap<number, string>('events_by_block_number')),
    }),
  },

  {
    name: 'RecipientTaggingStore',
    writeToStore: async kvStore => {
      const recipientTaggingStore = new RecipientTaggingStore(kvStore);

      const jobId = 'fixture-job';
      const secretA = new ExtendedDirectionalAppTaggingSecret(new Fr(2n), AztecAddress.fromBigInt(3n));
      const secretB = new ExtendedDirectionalAppTaggingSecret(new Fr(5n), AztecAddress.fromBigInt(7n));

      await recipientTaggingStore.updateHighestFinalizedIndex(secretA, 11, jobId);
      await recipientTaggingStore.updateHighestAgedIndex(secretA, 13, jobId);
      await recipientTaggingStore.updateHighestFinalizedIndex(secretB, 17, jobId);
      await kvStore.transactionAsync(() => recipientTaggingStore.commit(jobId));
    },
    snapshotStore: async kvStore => ({
      highest_aged_index: await snapshotMap(kvStore.openMap<string, number>('highest_aged_index')),
      highest_finalized_index: await snapshotMap(kvStore.openMap<string, number>('highest_finalized_index')),
    }),
  },

  {
    name: 'SenderAddressBookStore',
    writeToStore: async kvStore => {
      const senderAddressBookStore = new SenderAddressBookStore(kvStore);

      await senderAddressBookStore.addSender(AztecAddress.fromBigInt(2n));
      await senderAddressBookStore.addSender(AztecAddress.fromBigInt(3n));
      await senderAddressBookStore.addSender(AztecAddress.fromBigInt(5n));
    },
    snapshotStore: async kvStore => ({
      address_book: await snapshotMap(kvStore.openMap<string, true>('address_book')),
    }),
  },

  {
    name: 'SenderTaggingStore',
    writeToStore: async kvStore => {
      const senderTaggingStore = new SenderTaggingStore(kvStore);

      const jobId = 'fixture-job';
      const secretA = new ExtendedDirectionalAppTaggingSecret(new Fr(2n), AztecAddress.fromBigInt(3n));
      const secretB = new ExtendedDirectionalAppTaggingSecret(new Fr(5n), AztecAddress.fromBigInt(7n));
      const secretC = new ExtendedDirectionalAppTaggingSecret(new Fr(11n), AztecAddress.fromBigInt(13n));
      const txHashA = TxHash.fromBigInt(17n);
      const txHashB = TxHash.fromBigInt(19n);
      const txHashC = TxHash.fromBigInt(23n);
      const txHashD = TxHash.fromBigInt(29n);

      // secretA receives three pending ranges (one per tx); secretB receives one. After finalizing txHashA below,
      // secretA's array shrinks to two elements (the txHashB and txHashC ranges, both with highestIndex > 3) which
      // pins the multi-element JSON encoding of `pending_indexes`. secretB's array empties out and the commit
      // special-case at sender_tagging_store.ts:106-110 deletes the key entirely.
      const txHashARanges: TaggingIndexRange[] = [
        { extendedSecret: secretA, lowestIndex: 1, highestIndex: 3 },
        { extendedSecret: secretB, lowestIndex: 1, highestIndex: 5 },
      ];
      await senderTaggingStore.storePendingIndexes(txHashARanges, txHashA, jobId);

      await senderTaggingStore.storePendingIndexes(
        [{ extendedSecret: secretA, lowestIndex: 4, highestIndex: 7 }],
        txHashB,
        jobId,
      );

      // Re-store the exact same (secret, txHash, range) — exercises the "exact duplicate — skip" branch at
      // sender_tagging_store.ts:199. The snapshot must be unchanged by this call; it pins the no-op assumption.
      await senderTaggingStore.storePendingIndexes(
        [{ extendedSecret: secretA, lowestIndex: 4, highestIndex: 7 }],
        txHashB,
        jobId,
      );

      await senderTaggingStore.storePendingIndexes(
        [{ extendedSecret: secretA, lowestIndex: 8, highestIndex: 11 }],
        txHashC,
        jobId,
      );

      // secretC's range is never finalized, so it survives commit as a single-element pending array (contrast with
      // secretA's multi-element shape).
      await senderTaggingStore.storePendingIndexes(
        [{ extendedSecret: secretC, lowestIndex: 1, highestIndex: 9 }],
        txHashD,
        jobId,
      );

      await senderTaggingStore.finalizePendingIndexes([txHashA], jobId);

      await kvStore.transactionAsync(() => senderTaggingStore.commit(jobId));
    },
    snapshotStore: async kvStore => ({
      pending_indexes: await snapshotMap(kvStore.openMap<string, Buffer>('pending_indexes')),
      last_finalized_indexes: await snapshotMap(kvStore.openMap<string, number>('last_finalized_indexes')),
    }),
  },
];

describe('PXE storage compatibility test suite', () => {
  it('opens the expected set of stores, with a snapshot check for every opened sub-store', async () => {
    // Fingerprint the inventory of sub-stores opened by `openPxeStores`. If a store class is added, removed, or
    // changes its sub-store names, the inventory snapshot fails first and devs need to inspect what changed.
    const inventoryKvStore = await openTmpStore('pxe-schema-stores', true);
    let inventory: ReturnType<ReturnType<typeof createStoreSpy>['openedStores']>;
    try {
      const { store, openedStores } = createStoreSpy(inventoryKvStore);
      openPxeStores(store);
      inventory = openedStores();
      expectMatchesSnapshot({ schemaVersion: PXE_DATA_SCHEMA_VERSION, stores: inventory }, 'opened_stores');
    } finally {
      await inventoryKvStore.close();
    }

    // Every opened "sub-store" must be re-read by at least one of the tests specified in `SCHEMA_TESTS`. The spy is
    // applied ONLY to `snapshotStore`.
    const covered = new Set<string>();
    for (const t of SCHEMA_TESTS) {
      const kvStore = await openTmpStore(`pxe-schema-coverage-${t.name}`, true);
      try {
        await t.writeToStore(kvStore);
        const readSpy = createStoreSpy(kvStore);
        await t.snapshotStore(readSpy.store);
        readSpy.openedStores().forEach(e => covered.add(`${e.kind}:${e.name}`));
      } finally {
        await kvStore.close();
      }
    }

    const uncovered = inventory.map(e => `${e.kind}:${e.name}`).filter(n => !covered.has(n));
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
          "  2. In pxe_db_compatibility.test.ts, find that store class's entry in the SCHEMA_TESTS array. Add a",
          '     line to its `snapshotStore` callback that re-reads the sub-store. Look at sibling entries for the',
          '     pattern; for example:',
          "         last_finalized_indexes: await snapshotMap(kvStore.openMap<string, number>('last_finalized_indexes')),",
          '     Use snapshotMap / snapshotMultiMap / snapshotArray / snapshotSingleton according to the sub-store',
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

/**
 * Pads an Fr array to `totalLength` with `Fr.ZERO`. Used because `ContractClassLogFields` and `PrivateLog` require
 * fixed-length tuples; populating only the leading slots is enough to detect reorders, while the trailing zeros pin
 * the field's total width (a shrunk or grown constant shifts the byte count and shows up in the diff).
 */
function paddedFrs(leading: bigint[], totalLength: number): Fr[] {
  const out = leading.map(p => new Fr(p));
  while (out.length < totalLength) {
    out.push(Fr.ZERO);
  }
  return out;
}

/**
 * Builds a fully-populated `L2Block` with distinct values for every primitive field that appears in `toBuffer`.
 * We use distinct values to make a snapshot diff sensitive to regressions of specific fields, and same-width reorders.
 */
function buildL2Block(): L2Block {
  const archive = new AppendOnlyTreeSnapshot(new Fr(101n), 103);
  const header = new BlockHeader(
    new AppendOnlyTreeSnapshot(new Fr(107n), 109),
    new StateReference(
      new AppendOnlyTreeSnapshot(new Fr(113n), 127),
      new PartialStateReference(
        new AppendOnlyTreeSnapshot(new Fr(131n), 137),
        new AppendOnlyTreeSnapshot(new Fr(139n), 149),
        new AppendOnlyTreeSnapshot(new Fr(151n), 157),
      ),
    ),
    new Fr(163n),
    new GlobalVariables(
      new Fr(167n),
      new Fr(173n),
      BlockNumber(179),
      SlotNumber(181),
      191n,
      EthAddress.fromField(new Fr(193n)),
      AztecAddress.fromBigInt(197n),
      new GasFees(199n, 211n),
    ),
    new Fr(223n),
    new Fr(227n),
  );

  const txEffect = new TxEffect(
    RevertCode.REVERTED,
    TxHash.fromBigInt(229n),
    new Fr(233n),
    [new Fr(239n)],
    [new Fr(241n)],
    [new Fr(251n)],
    [new PublicDataWrite(new Fr(257n), new Fr(263n))],
    [
      new PrivateLog(
        paddedFrs([269n, 271n, 277n], PRIVATE_LOG_SIZE_IN_FIELDS) as Tuple<Fr, typeof PRIVATE_LOG_SIZE_IN_FIELDS>,
        3,
      ),
    ],
    [new PublicLog(AztecAddress.fromBigInt(281n), [new Fr(283n), new Fr(293n)])],
    [
      new ContractClassLog(
        AztecAddress.fromBigInt(307n),
        new ContractClassLogFields(paddedFrs([311n, 313n, 317n], CONTRACT_CLASS_LOG_SIZE_IN_FIELDS)),
        3,
      ),
    ],
  );

  return new L2Block(archive, header, new Body([txEffect]), CheckpointNumber(331), IndexWithinCheckpoint(337));
}

/**
 * Builds a deterministic, hand-rolled `ContractArtifact` for the ContractStore schema test. Every collection field
 * has at least one entry so that JSON serialization branches for non-empty arrays and records are exercised; values
 * are picked to be distinguishable so a reorder or shape change of `ContractArtifact`/`FunctionAbi` is visible in
 * the snapshot diff.
 *
 * Why not import a real noir-compiled artifact? Compiled artifacts embed noir-compiler output (error-type hashes,
 * debug symbols, struct paths) that drifts across compiler versions and produces spurious schema diffs unrelated to
 * PXE's on-disk layout.
 *  */
function buildSchemaContractArtifact(): ContractArtifact {
  return {
    name: 'SchemaFixtureContract',
    functions: [
      {
        name: 'private_fn',
        functionType: FunctionType.PRIVATE,
        isOnlySelf: false,
        isStatic: false,
        isInitializer: true,
        parameters: [
          { name: 'first', type: { kind: 'field' }, visibility: 'private' },
          { name: 'second', type: { kind: 'integer', sign: 'unsigned', width: 32 }, visibility: 'public' },
        ],
        returnTypes: [{ kind: 'boolean' }],
        errorTypes: {
          // Single entry. Exercises the non-empty `Record<string, AbiErrorType>` branch without depending on
          // noir compiler output.
          schema_test_error: { error_kind: 'string', string: 'fixed schema-test error' },
        },
        bytecode: Buffer.from([2, 3, 5, 7]),
        debugSymbols: 'schema-fixture-debug',
      },
    ],
    nonDispatchPublicFunctions: [
      {
        name: 'public_fn',
        functionType: FunctionType.PUBLIC,
        isOnlySelf: true,
        isStatic: true,
        isInitializer: false,
        parameters: [],
        returnTypes: [],
        errorTypes: {},
      },
    ],
    outputs: {
      structs: { my_struct: [{ kind: 'field' }, { kind: 'boolean' }] },
      globals: {},
    },
    storageLayout: { my_field: { slot: new Fr(11n) } },
    fileMap: {
      1: {
        source: 'schema fixture source',
        path: 'src/schema_fixture.nr',
        function_locations: [],
      },
    },
  };
}
