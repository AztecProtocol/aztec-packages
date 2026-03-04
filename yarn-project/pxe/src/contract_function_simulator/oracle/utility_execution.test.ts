import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import type { KeyStore } from '@aztec/key-store';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { WASMSimulator } from '@aztec/simulator/client';
import { EventSelector, FunctionCall, FunctionSelector, FunctionType, encodeArguments } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { CompleteAddress, type ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import { computeUniqueNoteHash, siloNoteHash, siloNullifier } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/server';
import { deriveKeys } from '@aztec/stdlib/keys';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { makeL2Tips } from '@aztec/stdlib/testing';
import { BlockHeader, GlobalVariables, TxEffect, TxHash } from '@aztec/stdlib/tx';

import { mock } from 'jest-mock-extended';
import type { _MockProxy } from 'jest-mock-extended/lib/Mock.js';

import type { ContractSyncService } from '../../contract_sync/contract_sync_service.js';
import type { AddressStore } from '../../storage/address_store/address_store.js';
import type { CapsuleStore } from '../../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../../storage/tagging_store/sender_address_book_store.js';
import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import { ContractFunctionSimulator } from '../contract_function_simulator.js';
import { DEFAULT_EVENT_BOUNDED_VEC_CAPACITY } from '../noir-structs/event_validation_request.js';
import { DEFAULT_NOTE_BOUNDED_VEC_CAPACITY } from '../noir-structs/note_validation_request.js';
import {
  EVENT_BOUNDED_VEC_CAPACITY_SLOT,
  NOTE_BOUNDED_VEC_CAPACITY_SLOT,
  UtilityExecutionOracle,
} from './utility_execution_oracle.js';

describe('Utility Execution test suite', () => {
  const simulator = new WASMSimulator();

  let contractStore: ReturnType<typeof mock<ContractStore>>;
  let noteStore: ReturnType<typeof mock<NoteStore>>;
  let keyStore: ReturnType<typeof mock<KeyStore>>;
  let addressStore: ReturnType<typeof mock<AddressStore>>;
  let aztecNode: ReturnType<typeof mock<AztecNode>>;
  let senderTaggingStore: ReturnType<typeof mock<SenderTaggingStore>>;
  let recipientTaggingStore: ReturnType<typeof mock<RecipientTaggingStore>>;
  let senderAddressBookStore: ReturnType<typeof mock<SenderAddressBookStore>>;
  let capsuleStore: ReturnType<typeof mock<CapsuleStore>>;
  let privateEventStore: ReturnType<typeof mock<PrivateEventStore>>;
  let contractSyncService: ReturnType<typeof mock<ContractSyncService>>;
  let acirSimulator: ContractFunctionSimulator;
  let owner: AztecAddress;
  let ownerCompleteAddress: CompleteAddress;
  let anchorBlockHeader: BlockHeader;
  const ownerSecretKey = Fr.fromHexString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');

  const buildNote = (amount: bigint) => {
    return new Note([new Fr(amount)]);
  };

  beforeEach(async () => {
    contractStore = mock<ContractStore>();
    noteStore = mock<NoteStore>();
    keyStore = mock<KeyStore>();
    addressStore = mock<AddressStore>();
    aztecNode = mock<AztecNode>();
    senderTaggingStore = mock<SenderTaggingStore>();
    recipientTaggingStore = mock<RecipientTaggingStore>();
    senderAddressBookStore = mock<SenderAddressBookStore>();
    capsuleStore = mock<CapsuleStore>();
    privateEventStore = mock<PrivateEventStore>();
    contractSyncService = mock<ContractSyncService>();
    const capsuleArrays = new Map<string, Fr[][]>();
    anchorBlockHeader = BlockHeader.random();
    senderTaggingStore.getLastFinalizedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getLastUsedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getTxHashesOfPendingIndexes.mockResolvedValue([]);
    senderTaggingStore.storePendingIndexes.mockResolvedValue();
    senderAddressBookStore.getSenders.mockResolvedValue([]);

    // Mock getL2Tips and getBlockHeader for loadPrivateLogsForSenderRecipientPair
    aztecNode.getL2Tips.mockResolvedValue(makeL2Tips(anchorBlockHeader.globalVariables.blockNumber));
    aztecNode.getBlockHeader.mockImplementation((blockNumber: BlockNumber | 'latest') => {
      if (blockNumber === 'latest') {
        return Promise.resolve(anchorBlockHeader);
      }
      return Promise.resolve(anchorBlockHeader);
    });
    aztecNode.getPrivateLogsByTags.mockImplementation((tags: any[]) => Promise.resolve(tags.map(() => [])));

    capsuleStore.setCapsuleArray.mockImplementation((address, slot, content) => {
      capsuleArrays.set(`${address.toString()}:${slot.toString()}`, content);
      return Promise.resolve();
    });
    capsuleStore.readCapsuleArray.mockImplementation((address, slot) => {
      return Promise.resolve(capsuleArrays.get(`${address.toString()}:${slot.toString()}`) ?? []);
    });
    acirSimulator = new ContractFunctionSimulator({
      contractStore,
      noteStore,
      keyStore,
      addressStore,
      aztecNode,
      senderTaggingStore,
      recipientTaggingStore,
      senderAddressBookStore,
      capsuleStore,
      privateEventStore,
      simulator,
      contractSyncService,
    });

    const ownerPartialAddress = Fr.random();
    ownerCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(ownerSecretKey, ownerPartialAddress);
    owner = ownerCompleteAddress.address;

    // Derive keys to get the incoming viewing secret key
    const { masterIncomingViewingSecretKey: ownerIvskM } = await deriveKeys(ownerSecretKey);

    keyStore.getAccounts.mockResolvedValue([owner]);

    // Mock getMasterIncomingViewingSecretKey to return a valid scalar
    // This is needed when LogService tries to compute directional app tagging secrets
    keyStore.getMasterIncomingViewingSecretKey.mockImplementation((address: AztecAddress) => {
      if (address.equals(owner)) {
        return Promise.resolve(ownerIvskM);
      }
      // Return a default value for any other address
      return Promise.resolve(GrumpkinScalar.random());
    });

    addressStore.getCompleteAddress.mockImplementation((account: AztecAddress) => {
      if (account.equals(owner)) {
        return Promise.resolve(ownerCompleteAddress);
      }
      throw new Error(`Unknown address ${account}`);
    });
  });

  it('should run the summed_values function on StatefulTestContractArtifact', async () => {
    const contractAddress = await AztecAddress.random();
    const artifact = {
      ...StatefulTestContractArtifact.functions.find(f => f.name === 'summed_values')!,
      contractName: StatefulTestContractArtifact.name,
    };

    const notes: Note[] = [...Array(5).fill(buildNote(1n)), ...Array(2).fill(buildNote(2n))];

    aztecNode.getPublicStorageAt.mockResolvedValue(Fr.ZERO);
    contractStore.getFunctionArtifact.mockResolvedValue(artifact);
    contractStore.getContractInstance.mockResolvedValue({
      currentContractClassId: new Fr(42),
      originalContractClassId: new Fr(42),
      address: contractAddress,
    } as ContractInstanceWithAddress);
    contractStore.getFunctionArtifactWithDebugMetadata.mockImplementation(async (address, selector) => {
      const artifact = await contractStore.getFunctionArtifact(address, selector);
      if (!artifact) {
        throw new Error(`Function not found: ${selector.toString()} in contract ${address}`);
      }
      return { ...artifact, debug: undefined };
    });
    noteStore.getNotes.mockResolvedValue(
      notes.map(
        note =>
          new NoteDao(
            note,
            contractAddress,
            owner,
            Fr.random(),
            Fr.random(),
            Fr.random(),
            Fr.random(),
            Fr.random(),
            TxHash.random(),
            BlockNumber(42),
            BlockHash.random().toString(),
            0,
            0,
          ),
      ),
    );

    capsuleStore.loadCapsule.mockImplementation((_, __) => Promise.resolve(null));

    const execRequest = FunctionCall.from({
      name: artifact.name,
      to: contractAddress,
      selector: FunctionSelector.empty(),
      type: FunctionType.UTILITY,
      hideMsgSender: false,
      isStatic: false,
      args: encodeArguments(artifact, [owner]),
      returnTypes: artifact.returnTypes,
    });

    const result = await acirSimulator.runUtility(execRequest, [], anchorBlockHeader, [], 'test-job-id');

    expect(result).toEqual([new Fr(9)]);
  }, 30_000);

  describe('UtilityExecutionOracle', () => {
    let contractAddress: AztecAddress;
    let utilityExecutionOracle: UtilityExecutionOracle;
    const syncedBlockNumber = 100;

    beforeEach(async () => {
      contractAddress = await AztecAddress.random();
      anchorBlockHeader = BlockHeader.empty({
        globalVariables: GlobalVariables.empty({ blockNumber: BlockNumber(syncedBlockNumber) }),
      });

      utilityExecutionOracle = new UtilityExecutionOracle({
        contractAddress,
        authWitnesses: [],
        capsules: [],
        anchorBlockHeader,
        contractStore,
        noteStore,
        keyStore,
        addressStore,
        aztecNode,
        recipientTaggingStore,
        senderAddressBookStore,
        capsuleStore,
        privateEventStore,
        jobId: 'test-job-id',
        scopes: 'ALL_SCOPES',
      });
    });

    describe('Respects synced block number', () => {
      it('throws when getting block for future block number', async () => {
        await expect(utilityExecutionOracle.utilityGetBlockHeader(BlockNumber(syncedBlockNumber + 1))).rejects.toThrow(
          `Block number ${syncedBlockNumber + 1} is higher than current block ${syncedBlockNumber}`,
        );
      });
    });

    describe('utilityValidateAndStoreEnqueuedNotesAndEvents', () => {
      const noteSlot = new Fr(100);
      const eventSlot = new Fr(200);

      const noteContractAddress = AztecAddress.fromField(new Fr(1));
      const noteHash = new Fr(6);
      const noteNonce = new Fr(3);
      const noteTxHash = TxHash.fromField(new Fr(8));

      const eventContractAddress = AztecAddress.fromField(new Fr(10));
      const eventCommitment = new Fr(60);
      const eventTxHash = TxHash.fromField(new Fr(80));

      const noteContentValues = [4, 5];
      const eventContentValues = [40, 50];

      it('deserializes and stores notes and events when capacity is explicit in capsule', async () => {
        mockCapsuleStore({ noteCapacity: 8, eventCapacity: 8 });
        await mockNode();

        await utilityExecutionOracle.utilityValidateAndStoreEnqueuedNotesAndEvents(
          contractAddress,
          noteSlot,
          eventSlot,
        );

        assertNoteStoredCorrectly();
        assertEventStoredCorrectly();
        assertCapsulesCleanedUp();
      });

      it('deserializes and stores notes and events using default capacity when capsule has none', async () => {
        mockCapsuleStore();
        await mockNode();

        await utilityExecutionOracle.utilityValidateAndStoreEnqueuedNotesAndEvents(
          contractAddress,
          noteSlot,
          eventSlot,
        );

        assertNoteStoredCorrectly();
        assertEventStoredCorrectly();
        assertCapsulesCleanedUp();
      });

      // --- Helpers ---

      // Wire format: contract_address, owner, storage_slot, randomness, nonce,
      //   ...noteContent (padded to capacity), contentLen, noteHash, nullifier, txHash, recipient
      function buildSerializedNote(capacity: number): Fr[] {
        const padding = new Array(capacity - noteContentValues.length).fill(0);
        return [1, 50, 2, 42, 3, ...noteContentValues, ...padding, noteContentValues.length, 6, 7, 8, 9].map(
          v => new Fr(v),
        );
      }

      // Wire format: contract_address, event_type_id, randomness,
      //   ...eventContent (padded to capacity), contentLen, event_commitment, tx_hash, recipient
      function buildSerializedEvent(capacity: number): Fr[] {
        const padding = new Array(capacity - eventContentValues.length).fill(0);
        return [10, 20, 30, ...eventContentValues, ...padding, eventContentValues.length, 60, 80, 90].map(
          v => new Fr(v),
        );
      }

      /** Populates the capsule store with one serialized note and one event request, using explicit or default capacity. */
      function mockCapsuleStore(opts: { noteCapacity?: number; eventCapacity?: number } = {}) {
        const noteSerializedCapacity = opts.noteCapacity ?? DEFAULT_NOTE_BOUNDED_VEC_CAPACITY;
        const eventSerializedCapacity = opts.eventCapacity ?? DEFAULT_EVENT_BOUNDED_VEC_CAPACITY;

        const capsules = new Map<string, Fr[] | null>();
        if (opts.noteCapacity !== undefined) {
          capsules.set(`${contractAddress.toString()}:${NOTE_BOUNDED_VEC_CAPACITY_SLOT.toString()}`, [
            new Fr(opts.noteCapacity),
          ]);
        }
        if (opts.eventCapacity !== undefined) {
          capsules.set(`${contractAddress.toString()}:${EVENT_BOUNDED_VEC_CAPACITY_SLOT.toString()}`, [
            new Fr(opts.eventCapacity),
          ]);
        }

        const capsuleArrays = new Map<string, Fr[][]>();
        capsuleArrays.set(`${contractAddress.toString()}:${noteSlot.toString()}`, [
          buildSerializedNote(noteSerializedCapacity),
        ]);
        capsuleArrays.set(`${contractAddress.toString()}:${eventSlot.toString()}`, [
          buildSerializedEvent(eventSerializedCapacity),
        ]);

        capsuleStore.loadCapsule.mockImplementation((address, slot) =>
          Promise.resolve(capsules.get(`${address.toString()}:${slot.toString()}`) ?? null),
        );
        capsuleStore.readCapsuleArray.mockImplementation((address, slot) =>
          Promise.resolve(capsuleArrays.get(`${address.toString()}:${slot.toString()}`) ?? []),
        );
        capsuleStore.setCapsuleArray.mockImplementation((address, slot, content) => {
          capsuleArrays.set(`${address.toString()}:${slot.toString()}`, content);
          return Promise.resolve();
        });
        capsuleStore.deleteCapsule.mockImplementation(() => {});
      }

      /** Mocks aztecNode to return the expected TxEffect (with note hashes or nullifiers) based on tx hash. */
      async function mockNode() {
        const uniqueNoteHash = await computeUniqueNoteHash(
          noteNonce,
          await siloNoteHash(noteContractAddress, noteHash),
        );
        const noteTxEffect = TxEffect.empty();
        noteTxEffect.txHash = noteTxHash;
        noteTxEffect.noteHashes = [uniqueNoteHash];

        const siloedEventCommitment = await siloNullifier(eventContractAddress, eventCommitment);
        const eventTxEffect = TxEffect.empty();
        eventTxEffect.txHash = eventTxHash;
        eventTxEffect.nullifiers = [siloedEventCommitment];

        const blockHash = BlockHash.random();
        aztecNode.getTxEffect.mockImplementation((txHash: TxHash) => {
          const data = txHash.equals(noteTxHash) ? noteTxEffect : eventTxEffect;
          return Promise.resolve({
            l2BlockNumber: BlockNumber(syncedBlockNumber - 1),
            l2BlockHash: blockHash,
            data,
            txIndexInBlock: 0,
          });
        });
        aztecNode.findLeavesIndexes.mockResolvedValue([undefined]);
      }

      function assertNoteStoredCorrectly() {
        expect(noteStore.addNotes).toHaveBeenCalledTimes(1);
        const storedNotes: NoteDao[] = noteStore.addNotes.mock.calls[0][0];
        expect(storedNotes).toHaveLength(1);
        const noteDao = storedNotes[0];
        expect(noteDao.note).toEqual(new Note([new Fr(4), new Fr(5)]));
        expect(noteDao.contractAddress).toEqual(noteContractAddress);
        expect(noteDao.owner).toEqual(AztecAddress.fromField(new Fr(50)));
        expect(noteDao.storageSlot).toEqual(new Fr(2));
        expect(noteDao.randomness).toEqual(new Fr(42));
        expect(noteDao.noteNonce).toEqual(noteNonce);
        expect(noteDao.noteHash).toEqual(noteHash);
        expect(noteDao.txHash).toEqual(noteTxHash);
      }

      function assertEventStoredCorrectly() {
        expect(privateEventStore.storePrivateEventLog).toHaveBeenCalledTimes(1);
        const call = privateEventStore.storePrivateEventLog.mock.calls[0];
        expect(call[0]).toEqual(EventSelector.fromField(new Fr(20)));
        expect(call[1]).toEqual(new Fr(30));
        expect(call[2]).toEqual([new Fr(40), new Fr(50)]);
        expect(call[4].contractAddress).toEqual(eventContractAddress);
        expect(call[4].txHash).toEqual(eventTxHash);
        expect(call[4].scope).toEqual(AztecAddress.fromField(new Fr(90)));
      }

      function assertCapsulesCleanedUp() {
        expect(capsuleStore.deleteCapsule).toHaveBeenCalledWith(
          contractAddress,
          NOTE_BOUNDED_VEC_CAPACITY_SLOT,
          'test-job-id',
        );
        expect(capsuleStore.deleteCapsule).toHaveBeenCalledWith(
          contractAddress,
          EVENT_BOUNDED_VEC_CAPACITY_SLOT,
          'test-job-id',
        );
        expect(capsuleStore.setCapsuleArray).toHaveBeenCalledWith(contractAddress, noteSlot, [], 'test-job-id');
        expect(capsuleStore.setCapsuleArray).toHaveBeenCalledWith(contractAddress, eventSlot, [], 'test-job-id');
      }
    });
  });
});
