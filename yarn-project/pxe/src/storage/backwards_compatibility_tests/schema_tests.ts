/* eslint-disable camelcase */
import { CONTRACT_CLASS_LOG_SIZE_IN_FIELDS, PRIVATE_LOG_SIZE_IN_FIELDS } from '@aztec/constants';
import { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { Point } from '@aztec/foundation/curves/grumpkin';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Tuple } from '@aztec/foundation/serialize';
import { KeyStore } from '@aztec/key-store';
import type { AztecAsyncKVStore } from '@aztec/kv-store';
import { L2TipsKVStore } from '@aztec/kv-store/stores';
import { type ContractArtifact, EventSelector, FunctionSelector, FunctionType } from '@aztec/stdlib/abi';
import { PublicDataWrite, RevertCode } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, Body, GENESIS_BLOCK_HEADER_HASH, L2Block } from '@aztec/stdlib/block';
import { Checkpoint, L1PublishedData, PublishedCheckpoint } from '@aztec/stdlib/checkpoint';
import { CompleteAddress, SerializableContractInstance } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import { PublicKey, PublicKeys, deriveKeys } from '@aztec/stdlib/keys';
import {
  AppTaggingSecret,
  AppTaggingSecretKind,
  ContractClassLog,
  ContractClassLogFields,
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

import { AddressStore } from '../address_store/address_store.js';
import { AnchorBlockStore } from '../anchor_block_store/index.js';
import { CapsuleStore } from '../capsule_store/capsule_store.js';
import { ContractStore } from '../contract_store/contract_store.js';
import { FactStore } from '../fact_store/fact_store.js';
import { FactCollectionKey } from '../fact_store/fact_store_keys.js';
import { NoteStore } from '../note_store/note_store.js';
import { PrivateEventStore } from '../private_event_store/private_event_store.js';
import { RecipientTaggingStore, SenderTaggingStore, TaggingSecretSourcesStore } from '../tagging_store/index.js';
import { snapshotArray, snapshotMap, snapshotSingleton } from './kv_store_snapshot.js';

/**
 * Template of a specific store's backwards compatibility checks.
 *
 * 1. `name` is the store's name (`AddressStore`, `NoteStore`, etc).
 * 2. `writeToStore` drives writes through each store's own production API (`addNote`, `setCapsule`, etc).
 * 3. `snapshotStore` re-opens the underlying kv-stores by name (raw) and renders them as snapshots.
 */
export type SchemaTest = {
  name: string;
  writeToStore: (kvStore: AztecAsyncKVStore) => Promise<void>;
  snapshotStore: (kvStore: AztecAsyncKVStore) => Promise<Record<string, unknown>>;
};

export const SCHEMA_TESTS: readonly SchemaTest[] = [
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
            AztecAddress.fromBigIntUnsafe(61n),
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
      const contractAddress = AztecAddress.fromBigIntUnsafe(2n);
      const scope = AztecAddress.fromBigIntUnsafe(3n);

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
          version: 2,
          salt: new Fr(73n),
          deployer: AztecAddress.fromBigIntUnsafe(79n),
          currentContractClassId: new Fr(83n),
          originalContractClassId: new Fr(89n),
          initializationHash: new Fr(97n),
          immutablesHash: new Fr(103n),
          // Only `ivpk_m` is exposed as a curve point; the other master keys
          // are exposed as `hash_public_key` digests. Constructor signature is
          // `(npkMHash, ivpkM, ovpkMHash, tpkMHash, mspkMHash, fbpkMHash)`.
          publicKeys: new PublicKeys(
            new Fr(41n),
            new PublicKey(new Fr(47n), new Fr(53n)),
            new Fr(59n),
            new Fr(67n),
            new Fr(71n),
            new Fr(73n),
          ),
        }).withAddress(AztecAddress.fromBigIntUnsafe(101n)),
      );
    },
    snapshotStore: async kvStore => ({
      contract_artifacts: await snapshotMap(kvStore.openMap<string, Buffer>('contract_artifacts')),
      contract_classes: await snapshotMap(kvStore.openMap<string, Buffer>('contract_classes')),
      contracts_instances: await snapshotMap(kvStore.openMap<string, Buffer>('contracts_instances')),
    }),
  },

  {
    name: 'FactStore',
    writeToStore: async kvStore => {
      const factStore = new FactStore(kvStore);
      const jobId = 'fixture-job';
      const contract = AztecAddress.fromBigIntUnsafe(100n);
      const scope = AztecAddress.fromBigIntUnsafe(1n);
      const factCollectionTypeId = new Fr(7n);
      const keyA = FactCollectionKey.from({
        contractAddress: contract,
        scope,
        factCollectionTypeId,
        factCollectionId: new Fr(0xaan),
      });
      const keyB = FactCollectionKey.from({
        contractAddress: contract,
        scope,
        factCollectionTypeId,
        factCollectionId: new Fr(0xbbn),
      });
      // A collection whose only fact is retractable (origin block 6): pruned on a reorg above block 6.
      await factStore.recordFact(keyA, new Fr(3n), [new Fr(5n)], { blockNumber: 6, blockHash: new Fr(2n) }, jobId);
      // A collection with a non-retractable and a retractable fact.
      await factStore.recordFact(keyB, new Fr(1n), [new Fr(9n)], undefined, jobId);
      await factStore.recordFact(keyB, new Fr(2n), [], { blockNumber: 5, blockHash: new Fr(1n) }, jobId);
      await kvStore.transactionAsync(() => factStore.commit(jobId));
    },
    snapshotStore: async kvStore => ({
      facts: await snapshotMap(kvStore.openMap<string, Buffer>('facts')),
      facts_by_collection: await snapshotMap(kvStore.openMultiMap<string, string>('facts_by_collection')),
      facts_by_block: await snapshotMap(kvStore.openMultiMap<number, string>('facts_by_block')),
    }),
  },

  {
    name: 'KeyStore',
    writeToStore: async kvStore => {
      const keyStore = new KeyStore(kvStore);
      await keyStore.addAccount(await deriveKeys(new Fr(2n)), new Fr(3n));
    },
    snapshotStore: async kvStore => ({
      key_store: await snapshotMap(kvStore.openMap<string, Buffer>('key_store')),
    }),
  },

  {
    name: 'L2TipsKVStore',
    writeToStore: async kvStore => {
      const l2TipsStore = new L2TipsKVStore(kvStore, 'pxe', GENESIS_BLOCK_HEADER_HASH);

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
            AztecAddress.fromBigIntUnsafe(31n),
            new GasFees(37n, 41n),
            new Fr(43n),
            new Fr(47n),
          ),
          [block],
          CheckpointNumber(47),
          53n,
        ),
        new L1PublishedData(59n, 61n, new Fr(67n).toString()),
        [],
      );

      // `'blocks-added'` writes to `pxe_l2_tips` (proposed tag) and `pxe_l2_block_hashes`.
      // `'chain-checkpointed'` writes the 'checkpointed' tip and its checkpoint id (`pxe_l2_tip_checkpoints`).
      await l2TipsStore.handleBlockStreamEvent({ type: 'blocks-added', blocks: [block] });
      await l2TipsStore.handleBlockStreamEvent({
        type: 'chain-checkpointed',
        block: { number: BlockNumber(71), hash: new Fr(73n).toString() },
        checkpoint: {
          number: publishedCheckpoint.checkpoint.number,
          hash: publishedCheckpoint.checkpoint.hash().toString(),
        },
      });
      // `'chain-proven'` writes the 'proven' tag. `'finalized'` is omitted because its handler runs delete-before
      // logic that would depend on the order of preceding events.
      await l2TipsStore.handleBlockStreamEvent({
        type: 'chain-proven',
        block: { number: BlockNumber(79), hash: new Fr(83n).toString() },
        checkpoint: { number: CheckpointNumber(47), hash: new Fr(89n).toString() },
      });
    },
    snapshotStore: async kvStore => ({
      pxe_l2_tips: await snapshotMap(kvStore.openMap<string, number>('pxe_l2_tips')),
      pxe_l2_tip_checkpoints: await snapshotMap(
        kvStore.openMap<string, { number: number; hash: string }>('pxe_l2_tip_checkpoints'),
      ),
      pxe_l2_block_hashes: await snapshotMap(kvStore.openMap<number, string>('pxe_l2_block_hashes')),
    }),
  },

  {
    name: 'NoteStore',
    writeToStore: async kvStore => {
      const noteStore = new NoteStore(kvStore);

      const jobId = 'fixture-job';
      noteStore.beginJob(jobId);

      // Two contracts so `note_nullifiers_by_contract` exhibits both a multi-value row (contractA → {n1, n2}) and a
      // single-value row (contractB → {n3}).
      const contractA = AztecAddress.fromBigIntUnsafe(2n);
      const contractB = AztecAddress.fromBigIntUnsafe(3n);
      const scopeX = AztecAddress.fromBigIntUnsafe(5n);
      const scopeY = AztecAddress.fromBigIntUnsafe(7n);

      // note1: active, will be added under two scopes to exercise the multi-element scopes vector encoding in
      // `StoredNote.toBuffer`.
      const note1 = new NoteDao(
        new Note([new Fr(13n), new Fr(17n), new Fr(19n)]),
        contractA,
        AztecAddress.fromBigIntUnsafe(23n),
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
        AztecAddress.fromBigIntUnsafe(83n),
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

      // note3: different contract; will be nullified to populate `note_nullifications_by_nullifier` and exercise the
      // append-only nullification record written by `applyNullifiers`.
      const note3 = new NoteDao(
        new Note([new Fr(139n), new Fr(149n), new Fr(151n)]),
        contractB,
        AztecAddress.fromBigIntUnsafe(157n),
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

      // Nullify note3 within the same job. `applyNullifiers` stages the emission block number for the note; `commit`
      // then flushes it to disk into `note_nullifications_by_nullifier`.
      await noteStore.applyNullifiers(
        [{ data: note3.siloedNullifier, l2BlockNumber: BlockNumber(223), l2BlockHash: BlockHash.ZERO }],
        jobId,
      );

      await kvStore.transactionAsync(() => noteStore.commit(jobId));
    },
    snapshotStore: async kvStore => ({
      notes: await snapshotMap(kvStore.openMap<string, Buffer>('notes')),
      note_nullifiers_by_contract: await snapshotMap(
        kvStore.openMultiMap<string, string>('note_nullifiers_by_contract'),
      ),
      note_nullifications_by_nullifier: await snapshotMap(
        kvStore.openMap<string, number>('note_nullifications_by_nullifier'),
      ),
      note_nullifiers_by_block: await snapshotMap(kvStore.openMultiMap<number, string>('note_nullifiers_by_block')),
      note_nullifications_by_block: await snapshotMap(
        kvStore.openMultiMap<number, string>('note_nullifications_by_block'),
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
      const contractA = AztecAddress.fromBigIntUnsafe(2n);
      const contractB = AztecAddress.fromBigIntUnsafe(3n);
      const selectorA = EventSelector.fromField(new Fr(5n));
      const selectorB = EventSelector.fromField(new Fr(7n));
      const scopeX = AztecAddress.fromBigIntUnsafe(11n);
      const scopeY = AztecAddress.fromBigIntUnsafe(13n);
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
      events_by_contract_selector: await snapshotMap(
        kvStore.openMultiMap<string, string>('events_by_contract_selector'),
      ),
      events_by_block_number: await snapshotMap(kvStore.openMultiMap<number, string>('events_by_block_number')),
    }),
  },

  {
    name: 'RecipientTaggingStore',
    writeToStore: async kvStore => {
      const recipientTaggingStore = new RecipientTaggingStore(kvStore);

      const jobId = 'fixture-job';
      const secretA = new AppTaggingSecret(new Fr(2n), AztecAddress.fromBigIntUnsafe(3n));
      const secretB = new AppTaggingSecret(new Fr(5n), AztecAddress.fromBigIntUnsafe(7n));
      // A constrained secret keys under the `constrained:` prefix, so the snapshot pins both kinds side by side.
      const secretConstrained = new AppTaggingSecret(
        new Fr(19n),
        AztecAddress.fromBigIntUnsafe(23n),
        AppTaggingSecretKind.CONSTRAINED,
      );

      await recipientTaggingStore.updateHighestFinalizedIndex(secretA, 11, jobId);
      await recipientTaggingStore.updateHighestAgedIndex(secretA, 13, jobId);
      await recipientTaggingStore.updateHighestFinalizedIndex(secretB, 17, jobId);
      await recipientTaggingStore.updateHighestFinalizedIndex(secretConstrained, 11, jobId);
      await recipientTaggingStore.updateHighestAgedIndex(secretConstrained, 13, jobId);
      await kvStore.transactionAsync(() => recipientTaggingStore.commit(jobId));
    },
    snapshotStore: async kvStore => ({
      highest_aged_index: await snapshotMap(kvStore.openMap<string, number>('highest_aged_index')),
      highest_finalized_index: await snapshotMap(kvStore.openMap<string, number>('highest_finalized_index')),
    }),
  },

  {
    name: 'TaggingSecretSourcesStore',
    writeToStore: async kvStore => {
      const taggingSecretSourcesStore = new TaggingSecretSourcesStore(kvStore);

      await taggingSecretSourcesStore.addSender(AztecAddress.fromBigIntUnsafe(2n));
      await taggingSecretSourcesStore.addSender(AztecAddress.fromBigIntUnsafe(3n));
      await taggingSecretSourcesStore.addSender(AztecAddress.fromBigIntUnsafe(5n));

      await taggingSecretSourcesStore.addSharedSecret(
        AztecAddress.fromBigIntUnsafe(7n),
        'arbitrary-secret',
        new Point(new Fr(2n), new Fr(3n)),
      );
      await taggingSecretSourcesStore.addSharedSecret(
        AztecAddress.fromBigIntUnsafe(7n),
        'handshake',
        new Point(new Fr(5n), new Fr(7n)),
      );
      await taggingSecretSourcesStore.addSharedSecret(
        AztecAddress.fromBigIntUnsafe(11n),
        'arbitrary-secret',
        new Point(new Fr(13n), new Fr(17n)),
      );
    },
    snapshotStore: async kvStore => ({
      senders: await snapshotMap(kvStore.openMap<string, true>('senders')),
      recipient_shared_secrets: await snapshotMap(
        kvStore.openMultiMap<string, { kind: string; secret: string }>('recipient_shared_secrets'),
      ),
    }),
  },

  {
    name: 'SenderTaggingStore',
    writeToStore: async kvStore => {
      const senderTaggingStore = new SenderTaggingStore(kvStore);

      const jobId = 'fixture-job';
      const secretA = new AppTaggingSecret(new Fr(2n), AztecAddress.fromBigIntUnsafe(3n));
      const secretB = new AppTaggingSecret(new Fr(5n), AztecAddress.fromBigIntUnsafe(7n));
      const secretC = new AppTaggingSecret(new Fr(11n), AztecAddress.fromBigIntUnsafe(13n));
      const secretConstrained = new AppTaggingSecret(
        new Fr(19n),
        AztecAddress.fromBigIntUnsafe(23n),
        AppTaggingSecretKind.CONSTRAINED,
      );
      const txHashA = TxHash.fromBigInt(17n);
      const txHashB = TxHash.fromBigInt(19n);
      const txHashC = TxHash.fromBigInt(23n);
      const txHashD = TxHash.fromBigInt(29n);
      const txHashE = TxHash.fromBigInt(31n);
      const txHashF = TxHash.fromBigInt(37n);

      // secretA receives three pending ranges (one per tx); secretB receives one. After finalizing txHashA below,
      // secretA's array shrinks to two elements (the txHashB and txHashC ranges, both with highestIndex > 3) which
      // pins the multi-element JSON encoding of `pending_indexes`.
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

      // Re-store the exact same (secret, txHash, range). Exercises the "exact duplicate — skip" branch at
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

      // secretConstrained gets a finalized range (txHashE) plus a surviving higher pending range (txHashF), so the
      // `constrained:` key lands in both pending_indexes and last_finalized_indexes.
      await senderTaggingStore.storePendingIndexes(
        [{ extendedSecret: secretConstrained, lowestIndex: 1, highestIndex: 3 }],
        txHashE,
        jobId,
      );
      await senderTaggingStore.storePendingIndexes(
        [{ extendedSecret: secretConstrained, lowestIndex: 4, highestIndex: 7 }],
        txHashF,
        jobId,
      );

      await senderTaggingStore.finalizePendingIndexes([txHashA, txHashE], jobId);

      await kvStore.transactionAsync(() => senderTaggingStore.commit(jobId));
    },
    snapshotStore: async kvStore => ({
      pending_indexes: await snapshotMap(kvStore.openMap<string, Buffer>('pending_indexes')),
      last_finalized_indexes: await snapshotMap(kvStore.openMap<string, number>('last_finalized_indexes')),
    }),
  },
];

/**
 * Pads an Fr array to `totalLength` with `Fr.ZERO`. Returns plain `Fr[]` rather than `Tuple<Fr, N>` so that callers
 * with very large `totalLength` (e.g. `CONTRACT_CLASS_LOG_SIZE_IN_FIELDS = 3023`) don't trip TypeScript's recursive
 * type instantiation depth limit on `Tuple<T, N>` — which is why we don't simply call `padArrayEnd` from foundation.
 * Used because `ContractClassLogFields` and `PrivateLog` require fixed-length collections; populating only the leading
 * slots is enough to detect reorders, while the trailing zeros pin each field's total width (a shrunk or grown size
 * constant shifts the byte count and shows up in the snapshot diff).
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
      AztecAddress.fromBigIntUnsafe(197n),
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
    [new PublicLog(AztecAddress.fromBigIntUnsafe(281n), [new Fr(283n), new Fr(293n)])],
    [
      new ContractClassLog(
        AztecAddress.fromBigIntUnsafe(307n),
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
 */
function buildSchemaContractArtifact(): ContractArtifact {
  return {
    name: 'SchemaFixtureContract',
    aztecVersion: 'schema-fixture-version',
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
