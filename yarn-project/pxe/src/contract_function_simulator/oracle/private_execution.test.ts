import { DomainSeparator, MAX_PROCESSABLE_L2_GAS, MAX_TX_DA_GAS } from '@aztec/constants';
import { asyncMap } from '@aztec/foundation/async-map';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { poseidon2Hash, poseidon2HashWithSeparator } from '@aztec/foundation/crypto/poseidon';
import { randomInt } from '@aztec/foundation/crypto/random';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { GrumpkinScalar } from '@aztec/foundation/curves/grumpkin';
import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { FieldsOf } from '@aztec/foundation/types';
import { KeyStore } from '@aztec/key-store';
import { CalldataLimitTestContractArtifact } from '@aztec/noir-test-contracts.js/CalldataLimitTest';
import { ChildContractArtifact } from '@aztec/noir-test-contracts.js/Child';
import { ParentContractArtifact } from '@aztec/noir-test-contracts.js/Parent';
import { PendingNoteHashesContractArtifact } from '@aztec/noir-test-contracts.js/PendingNoteHashes';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { WASMSimulator } from '@aztec/simulator/client';
import { HandshakeRegistryArtifact } from '@aztec/standard-contracts/handshake-registry';
import { STANDARD_HANDSHAKE_REGISTRY_ADDRESS } from '@aztec/standard-contracts/handshake-registry/constants';
import {
  type ContractArtifact,
  FunctionCall,
  FunctionSelector,
  encodeArguments,
  getFunctionArtifact,
  getFunctionArtifactByName,
} from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash, type BlockParameter, type L2TipsProvider } from '@aztec/stdlib/block';
import {
  CompleteAddress,
  getContractClassFromArtifact,
  getContractInstanceFromInstantiationParams,
} from '@aztec/stdlib/contract';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import { computeNoteHashNonce, computeSecretHash, computeUniqueNoteHash, siloNoteHash } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import type { MerkleTreeWriteOperations } from '@aztec/stdlib/interfaces/server';
import { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { computeAppNullifierHidingKey, deriveKeys } from '@aztec/stdlib/keys';
import { L1Actor, L1ToL2Message, L2Actor } from '@aztec/stdlib/messaging';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { makeBlockHeader, makeL2Tips, randomContractInstanceWithAddress } from '@aztec/stdlib/testing';
import { MerkleTreeId } from '@aztec/stdlib/trees';
import { BlockHeader, HashedValues, TxContext, TxExecutionRequest, TxHash } from '@aztec/stdlib/tx';
import { NativeWorldStateService } from '@aztec/world-state';

import { jest } from '@jest/globals';
import { Matcher, type MatcherCreator, type MockProxy, mock } from 'jest-mock-extended';
import { toFunctionSelector } from 'viem';

import type { ContractSyncService } from '../../contract_sync/contract_sync_service.js';
import { syncScope } from '../../contract_sync/helpers.js';
import type { MessageContextService } from '../../messages/message_context_service.js';
import type { AddressStore } from '../../storage/address_store/address_store.js';
import type { CapsuleStore } from '../../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
import type { TaggingSecretSourcesStore } from '../../storage/tagging_store/tagging_secret_sources_store.js';
import { ContractFunctionSimulator } from '../contract_function_simulator.js';

jest.setTimeout(60_000);

/**
 * Test utility function to craft an L1 to L2 message.
 * @param selector - The cross chain message selector.
 * @param contentPreimage - The args after the selector.
 * @param targetContract - The contract to consume the message.
 * @param secret - The secret to unlock the message.
 * @param msgIndex - The index of the message in the L1 to L2 message tree.
 * @returns The L1 to L2 message.
 */
export const buildL1ToL2Message = async (
  selector: string,
  contentPreimage: Fr[],
  targetContract: AztecAddress,
  secret: Fr,
  msgIndex: Fr | number,
) => {
  // Write the selector into a buffer.
  const selectorBuf = Buffer.from(selector, 'hex');

  const content = sha256ToField([selectorBuf, ...contentPreimage]);
  const secretHash = await computeSecretHash(secret);

  return new L1ToL2Message(
    new L1Actor(EthAddress.random(), 1),
    new L2Actor(targetContract, 1),
    content,
    secretHash,
    new Fr(msgIndex),
  );
};

describe('Private Execution test suite', () => {
  const simulator = new WASMSimulator();

  let contractStore: MockProxy<ContractStore>;
  let noteStore: MockProxy<NoteStore>;
  let addressStore: MockProxy<AddressStore>;
  let keyStore: MockProxy<KeyStore>;
  let senderTaggingStore: MockProxy<SenderTaggingStore>;
  let recipientTaggingStore: MockProxy<RecipientTaggingStore>;
  let taggingSecretSourcesStore: MockProxy<TaggingSecretSourcesStore>;
  let aztecNode: MockProxy<AztecNode>;
  let capsuleStore: MockProxy<CapsuleStore>;
  let privateEventStore: MockProxy<PrivateEventStore>;
  let contractSyncService: MockProxy<ContractSyncService>;
  let messageContextService: MockProxy<MessageContextService>;
  let l2TipsStore: MockProxy<L2TipsProvider>;
  let acirSimulator: ContractFunctionSimulator;
  let anchorBlockHeader = BlockHeader.empty();
  let logger: Logger;

  const ownerSk = Fr.fromHexString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');
  const recipientSk = Fr.fromHexString('0c9ed344548e8f9ba8aa3c9f8651eaa2853130f6c1e9c050ccf198f7ea18a7ec');
  const senderForTagsSk = Fr.fromHexString('2f0e5a8f3ba9c0738d6f3a9e0c2e13f7b2d4207f36efda729a2c6e2a5a9f8b1d');
  let owner: AztecAddress;
  let recipient: AztecAddress;
  let senderForTags: AztecAddress;
  let ownerCompleteAddress: CompleteAddress;
  let recipientCompleteAddress: CompleteAddress;
  let senderForTagsCompleteAddress: CompleteAddress;

  let ownerNhkM: GrumpkinScalar;
  let recipientNhkM: GrumpkinScalar;
  let senderForTagsNhkM: GrumpkinScalar;
  let ownerIvskM: GrumpkinScalar;
  let recipientIvskM: GrumpkinScalar;
  let senderForTagsIvskM: GrumpkinScalar;

  const TEST_JOB_ID = 'test-job-id';

  const treeNameToId: { [name: string]: MerkleTreeId } = {
    noteHash: MerkleTreeId.NOTE_HASH_TREE,
    l1ToL2Messages: MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
    publicData: MerkleTreeId.PUBLIC_DATA_TREE,
  };

  let ws: NativeWorldStateService;
  let fork: MerkleTreeWriteOperations;
  const txContextFields: FieldsOf<TxContext> = {
    chainId: new Fr(10),
    version: new Fr(20),
    gasSettings: GasSettings.fallback({
      gasLimits: new Gas(MAX_TX_DA_GAS, MAX_PROCESSABLE_L2_GAS),
      maxFeesPerGas: new GasFees(10, 10),
    }),
  };

  let contracts: { [address: string]: ContractArtifact };

  // expectedValue is optional
  const aztecAddressMatcher: MatcherCreator<AztecAddress> = expectedValue =>
    new Matcher(actualValue => {
      return expectedValue?.toString() === actualValue.toString();
    }, 'Matches aztec addresses');

  const mockContractInstance = async (artifact: ContractArtifact) => {
    const contractClass = await getContractClassFromArtifact(artifact);
    const instance = await randomContractInstanceWithAddress({ contractClassId: contractClass.id });
    contracts[instance.address.toString()] = artifact;
    contractStore.getContractInstance.calledWith(aztecAddressMatcher(instance.address)).mockResolvedValue(instance);
    return instance.address;
  };

  const runSimulator = async ({
    artifact,
    functionName,
    anchorBlockHeader,
    args = [],
    /** Notice that we're defaulting to the "null" msg_sender, which many public functions will fail to unwrap, and will revert. */
    msgSender = AztecAddress.NULL_MSG_SENDER,
    contractAddress = undefined,
    txContext = {},
  }: {
    artifact: ContractArtifact;
    functionName: string;
    anchorBlockHeader: BlockHeader;
    msgSender?: AztecAddress;
    contractAddress?: AztecAddress;
    args?: any[];
    txContext?: Partial<FieldsOf<TxContext>>;
  }) => {
    const functionArtifact = getFunctionArtifactByName(artifact, functionName);
    contractAddress = contractAddress ?? (await mockContractInstance(artifact));
    contracts[contractAddress.toString()] = artifact;
    const selector = await FunctionSelector.fromNameAndParameters(functionName, functionArtifact.parameters);

    const hashedArguments = await HashedValues.fromArgs(encodeArguments(functionArtifact, args));
    const txRequest = TxExecutionRequest.from({
      origin: contractAddress,
      firstCallArgsHash: hashedArguments.hash,
      functionSelector: selector,
      txContext: TxContext.from({ ...txContextFields, ...txContext }),
      argsOfCalls: [hashedArguments],
      authWitnesses: [],
      capsules: [],
      salt: Fr.random(),
    });

    return acirSimulator.run(txRequest, {
      msgSender,
      anchorBlockHeader,
      senderForTags,
      jobId: TEST_JOB_ID,
      scopes: [owner],
    });
  };

  const insertLeaves = async (leaves: Fr[], name = 'noteHash') => {
    const treeId = treeNameToId[name];
    if (treeId === undefined) {
      throw new Error(`Unknown tree ${name}`);
    }

    await fork.appendLeaves(treeId, leaves);
    const state = await fork.getStateReference();

    anchorBlockHeader = new BlockHeader(
      anchorBlockHeader.lastArchive,
      state,
      anchorBlockHeader.spongeBlobHash,
      anchorBlockHeader.globalVariables,
      anchorBlockHeader.totalFees,
      anchorBlockHeader.totalManaUsed,
    );
  };

  const computeNoteHash = (note: Note, owner: AztecAddress, storageSlot: Fr, randomness: Fr) => {
    // We're assuming here that the note hash function is the default one injected by the #[note] macro.
    return poseidon2HashWithSeparator(
      [storageSlot, ...note.items, owner.toField(), randomness],
      DomainSeparator.NOTE_HASH,
    );
  };

  beforeAll(async () => {
    logger = createLogger('simulator:test:private_execution');

    const ownerPartialAddress = Fr.random();
    ownerCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(ownerSk, ownerPartialAddress);
    ({ masterNullifierHidingKey: ownerNhkM, masterIncomingViewingSecretKey: ownerIvskM } = await deriveKeys(ownerSk));

    const recipientPartialAddress = Fr.random();
    recipientCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(
      recipientSk,
      recipientPartialAddress,
    );
    ({ masterNullifierHidingKey: recipientNhkM, masterIncomingViewingSecretKey: recipientIvskM } =
      await deriveKeys(recipientSk));

    const senderForTagsPartialAddress = Fr.random();
    senderForTagsCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(
      senderForTagsSk,
      senderForTagsPartialAddress,
    );
    ({ masterNullifierHidingKey: senderForTagsNhkM, masterIncomingViewingSecretKey: senderForTagsIvskM } =
      await deriveKeys(senderForTagsSk));

    owner = ownerCompleteAddress.address;
    recipient = recipientCompleteAddress.address;
    senderForTags = senderForTagsCompleteAddress.address;
  });

  afterEach(async () => {
    await fork?.close();
    await ws?.close();
  });

  beforeEach(async () => {
    ws = await NativeWorldStateService.tmp();
    fork = await ws.fork();
    contractStore = mock<ContractStore>();
    noteStore = mock<NoteStore>();
    noteStore.getNotes.mockResolvedValue([]);
    addressStore = mock<AddressStore>();
    senderTaggingStore = mock<SenderTaggingStore>();
    recipientTaggingStore = mock<RecipientTaggingStore>();
    aztecNode = mock<AztecNode>();
    keyStore = mock<KeyStore>();
    capsuleStore = mock<CapsuleStore>();
    l2TipsStore = mock<L2TipsProvider>();
    privateEventStore = mock<PrivateEventStore>();
    taggingSecretSourcesStore = mock<TaggingSecretSourcesStore>();
    contractSyncService = mock<ContractSyncService>();
    messageContextService = mock<MessageContextService>();
    messageContextService.getMessageContextsByTxHash.mockResolvedValue([]);
    // Configure mock to actually perform sync_state calls (needed for nested call tests)
    contractSyncService.ensureContractSynced.mockImplementation(
      async (contractAddress, functionToInvokeAfterSync, utilityExecutor, _anchorBlockHeader, _jobId, scopes) => {
        for (const scope of scopes) {
          await syncScope(contractAddress, contractStore, functionToInvokeAfterSync, utilityExecutor, scope);
        }
      },
    );
    contracts = {};
    contracts[STANDARD_HANDSHAKE_REGISTRY_ADDRESS.toString()] = HandshakeRegistryArtifact;
    anchorBlockHeader = makeBlockHeader();
    capsuleStore.readCapsuleArray.mockResolvedValue([]);

    // Mock sender tagging data provider methods
    senderTaggingStore.getLastFinalizedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getLastUsedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getTxHashesOfPendingIndexes.mockResolvedValue([]);
    senderTaggingStore.storePendingIndexes.mockResolvedValue();

    taggingSecretSourcesStore.getSenders.mockResolvedValue([]);
    taggingSecretSourcesStore.getSharedSecrets.mockResolvedValue([]);

    // Mock aztec node methods - the return array needs to have the same length as the number of tags
    // on the input.
    aztecNode.getPrivateLogsByTags.mockImplementation(query => Promise.resolve(query.tags.map(() => [])));

    // Mock getL2Tips and getBlockHeader for syncTaggedPrivateLogs
    l2TipsStore.getL2Tips.mockResolvedValue(makeL2Tips(anchorBlockHeader.globalVariables.blockNumber));

    // TODO: refactor. Maybe it's worth stubbing a key store
    // and cleaning up the mess that is setting up keys.
    // Also: having owner, recipient, and sender for tags
    // in the same key store is maybe too weak of a set up to test?
    keyStore.getMasterIncomingViewingSecretKey.mockImplementation((address: AztecAddress) => {
      if (address.equals(owner)) {
        return Promise.resolve(ownerIvskM);
      }
      if (address.equals(recipient)) {
        return Promise.resolve(recipientIvskM);
      }
      if (address.equals(senderForTags)) {
        return Promise.resolve(senderForTagsIvskM);
      }
      return Promise.resolve(ownerIvskM);
    });

    keyStore.getAccounts.mockResolvedValue([owner, recipient, senderForTags]);

    keyStore.accountHasKey.mockImplementation((account: AztecAddress, pkMHash: Fr) => {
      if (account.equals(owner)) {
        return Promise.resolve(pkMHash.equals(ownerCompleteAddress.publicKeys.npkMHash));
      }
      if (account.equals(recipient)) {
        return Promise.resolve(pkMHash.equals(recipientCompleteAddress.publicKeys.npkMHash));
      }
      if (account.equals(senderForTags)) {
        return Promise.resolve(pkMHash.equals(senderForTagsCompleteAddress.publicKeys.npkMHash));
      }
      return Promise.resolve(false);
    });

    keyStore.getKeyValidationRequest.mockImplementation(async (pkMHash: Fr, contractAddress: AztecAddress) => {
      if (pkMHash.equals(ownerCompleteAddress.publicKeys.npkMHash)) {
        return Promise.resolve(
          new KeyValidationRequest(
            ownerCompleteAddress.publicKeys.npkMHash,
            await computeAppNullifierHidingKey(ownerNhkM, contractAddress),
          ),
        );
      }
      if (pkMHash.equals(recipientCompleteAddress.publicKeys.npkMHash)) {
        return Promise.resolve(
          new KeyValidationRequest(
            recipientCompleteAddress.publicKeys.npkMHash,
            await computeAppNullifierHidingKey(recipientNhkM, contractAddress),
          ),
        );
      }
      if (pkMHash.equals(senderForTagsCompleteAddress.publicKeys.npkMHash)) {
        return Promise.resolve(
          new KeyValidationRequest(
            senderForTagsCompleteAddress.publicKeys.npkMHash,
            await computeAppNullifierHidingKey(senderForTagsNhkM, contractAddress),
          ),
        );
      }

      throw new Error(`Unknown master public key hash: ${pkMHash}`);
    });

    // We call insertLeaves here with no leaves to populate empty public data tree root --> this is necessary to be
    // able to get ivpk_m during execution
    await insertLeaves([], 'publicData');

    addressStore.getCompleteAddress.mockImplementation((address: AztecAddress) => {
      if (address.equals(owner)) {
        return Promise.resolve(ownerCompleteAddress);
      }
      if (address.equals(recipient)) {
        return Promise.resolve(recipientCompleteAddress);
      }

      if (address.equals(senderForTags)) {
        return Promise.resolve(senderForTagsCompleteAddress);
      }

      throw new Error(
        `Unknown address: ${address}. Recipient: ${recipient}, Owner: ${owner}, Sender for tags: ${senderForTags}`,
      );
    });

    contractStore.getFunctionArtifact.mockImplementation(async (address, selector) => {
      const contract = contracts[address.toString()];
      if (!contract) {
        throw new Error(`Contract not found: ${address}`);
      }
      const artifact = await getFunctionArtifact(contract, selector);
      if (!artifact) {
        throw new Error(`Function not found: ${selector.toString()} in contract ${address}`);
      }
      return Promise.resolve(artifact);
    });
    contractStore.getFunctionArtifactWithDebugMetadata.mockImplementation(async (address, selector) => {
      const artifact = await contractStore.getFunctionArtifact(address, selector);
      if (!artifact) {
        throw new Error(`Function not found: ${selector.toString()} in contract ${address}`);
      }
      return { ...artifact, debug: undefined };
    });
    contractStore.getFunctionCall.mockImplementation(async (functionName, args, to) => {
      const contract = contracts[to.toString()];
      if (!contract) {
        throw new Error(`Contract not found: ${to}`);
      }
      const functionArtifact = getFunctionArtifactByName(contract, functionName);
      return FunctionCall.from({
        name: functionArtifact.name,
        to,
        selector: await FunctionSelector.fromNameAndParameters(functionArtifact.name, functionArtifact.parameters),
        type: functionArtifact.functionType,
        hideMsgSender: false,
        isStatic: functionArtifact.isStatic,
        args: encodeArguments(functionArtifact, args),
        returnTypes: functionArtifact.returnTypes,
      });
    });

    capsuleStore.getCapsule.mockImplementation((_, __) => Promise.resolve(null));

    aztecNode.getPublicStorageAt.mockImplementation(
      (_block: BlockParameter, _address: AztecAddress, _storageSlot: Fr) => {
        return Promise.resolve(Fr.ZERO);
      },
    );

    acirSimulator = new ContractFunctionSimulator({
      contractStore,
      noteStore,
      keyStore,
      addressStore,
      aztecNode,
      l2TipsStore,
      senderTaggingStore,
      recipientTaggingStore,
      taggingSecretSourcesStore,
      capsuleStore,
      privateEventStore,
      simulator,
      contractSyncService,
      messageContextService,
    });
  });

  describe('no constructor', () => {
    it('emits a field array as an encrypted log', async () => {
      const args = [Fr.ZERO, times(5, () => Fr.random()), owner, false];
      const result = await runSimulator({
        artifact: TestContractArtifact,
        functionName: 'emit_array_as_encrypted_log',
        anchorBlockHeader,
        msgSender: owner,
        args,
      });

      const privateLogs = result.entrypoint.publicInputs.privateLogs;
      expect(privateLogs.claimedLength).toBe(1);
    });
  });

  describe('stateful test contract', () => {
    let contractAddress: AztecAddress;
    const mockFirstNullifier = new Fr(1111);

    const buildNote = async (amount: bigint, owner: AztecAddress, storageSlot: Fr): Promise<NoteDao> => {
      // WARNING: this is not actually how nonces are computed!
      // For the purpose of this test we use a mocked firstNullifier and and a random number
      // to compute the nonce. Proper nonces are only enforced later by the kernel/later circuits
      // which are not relevant to this test. In practice, the kernel first squashes all transient
      // noteHashes with their matching nullifiers. It then reorders the remaining "persistable"
      // noteHashes. A TX's real first nullifier (generated by the initial kernel) and a noteHash's
      // array index at the output of the final kernel/ordering circuit are used to derive nonce via:
      // `hash(firstNullifier, noteHashIndex)`
      const noteHashIndex = randomInt(1); // mock index in TX's final noteHashes array
      const noteNonce = await computeNoteHashNonce(mockFirstNullifier, noteHashIndex);
      const note = new Note([new Fr(amount)]);
      // Note: The following does not correspond to how note hashing is generally done in real notes.
      const noteHash = await poseidon2Hash([storageSlot, ...note.items]);
      const randomness = Fr.random();

      return new NoteDao(
        note,
        contractAddress,
        owner,
        storageSlot,
        randomness,
        noteNonce,
        noteHash,
        new Fr(0),
        TxHash.random(),
        BlockNumber(Math.abs(randomInt(1000))),
        BlockHash.random().toString(),
        0,
        0,
      );
    };

    beforeEach(async () => {
      contractAddress = await mockContractInstance(StatefulTestContractArtifact);
    });

    it('should have a constructor with arguments that inserts notes', async () => {
      const initArgs = [owner, 140];
      const instance = await getContractInstanceFromInstantiationParams(StatefulTestContractArtifact, {
        constructorArgs: initArgs,
        salt: Fr.random(),
      });
      contractStore.getContractInstance.mockResolvedValue(instance);
      const executionResult = await runSimulator({
        args: initArgs,
        artifact: StatefulTestContractArtifact,
        anchorBlockHeader,
        functionName: 'constructor',
        contractAddress: instance.address,
        msgSender: AztecAddress.fromNumberUnsafe(1234),
      });
      const result = executionResult.entrypoint.nestedExecutionResults[0];

      expect(result.newNotes).toHaveLength(1);
      const newNote = result.newNotes[0];
      expect(newNote.storageSlot).toEqual(StatefulTestContractArtifact.storageLayout['notes'].slot);

      const noteHashes = result.publicInputs.noteHashes;
      expect(noteHashes.claimedLength).toBe(1);
      expect(noteHashes.array[0].value).toEqual(
        await computeNoteHash(newNote.note, owner, newNote.storageSlot, newNote.randomness),
      );

      const privateLogs = result.publicInputs.privateLogs;
      expect(privateLogs.claimedLength).toBe(1);
    });

    it('should run the create_note function', async () => {
      const { entrypoint: result } = await runSimulator({
        args: [owner, 140],
        artifact: StatefulTestContractArtifact,
        anchorBlockHeader,
        functionName: 'create_note_no_init_check',
      });

      expect(result.newNotes).toHaveLength(1);
      const newNote = result.newNotes[0];
      expect(newNote.storageSlot).toEqual(StatefulTestContractArtifact.storageLayout['notes'].slot);

      const noteHashes = result.publicInputs.noteHashes;
      expect(noteHashes.claimedLength).toBe(1);
      expect(noteHashes.array[0].value).toEqual(
        await computeNoteHash(newNote.note, owner, newNote.storageSlot, newNote.randomness),
      );

      const privateLogs = result.publicInputs.privateLogs;
      expect(privateLogs.claimedLength).toBe(1);
    });

    it('should run the destroy_and_create function', async () => {
      const storageSlot = StatefulTestContractArtifact.storageLayout['notes'].slot;

      const notes: NoteDao[] = await Promise.all([
        buildNote(60n, ownerCompleteAddress.address, storageSlot),
        buildNote(80n, ownerCompleteAddress.address, storageSlot),
      ]);

      noteStore.getNotes.mockResolvedValue(notes);

      const consumedNotes = await asyncMap(notes, async ({ note, noteNonce, randomness }) => {
        const noteHash = await computeNoteHash(note, owner, storageSlot, randomness);
        const siloedNoteHash = await siloNoteHash(contractAddress, noteHash);
        const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, siloedNoteHash);
        return uniqueNoteHash;
      });

      await insertLeaves(consumedNotes);

      const args = [recipient];
      const { entrypoint: result } = await runSimulator({
        args,
        artifact: StatefulTestContractArtifact,
        anchorBlockHeader,
        functionName: 'destroy_and_create_no_init_check',
        msgSender: owner,
        contractAddress,
      });

      // The two notes were nullified. Uses one of the notes as first nullifier, not requiring a protocol injected
      // nullifier, so the total number of nullifiers is still two.
      const nullifiers = result.publicInputs.nullifiers;
      expect(nullifiers.claimedLength).toBe(consumedNotes.length);

      expect(result.newNotes).toHaveLength(1);
      const [recipientNote] = result.newNotes;
      expect(recipientNote.storageSlot).toEqual(storageSlot);
      expect(recipientNote.note.items[0]).toEqual(new Fr(92n));

      const noteHashes = result.publicInputs.noteHashes;
      expect(noteHashes.claimedLength).toBe(1);

      const privateLogs = result.publicInputs.privateLogs;
      expect(privateLogs.claimedLength).toBe(1);

      const readRequests = result.publicInputs.noteHashReadRequests;
      expect(readRequests.claimedLength).toBe(consumedNotes.length);
    });

    it('should be able to destroy_and_create with dummy notes', async () => {
      const balance = 160n;

      const storageSlot = StatefulTestContractArtifact.storageLayout['notes'].slot;

      const notes = await Promise.all([buildNote(balance, ownerCompleteAddress.address, storageSlot)]);
      noteStore.getNotes.mockResolvedValue(notes);

      const consumedNotes = await asyncMap(notes, async ({ note, noteNonce, randomness }) => {
        const noteHash = await computeNoteHash(note, owner, storageSlot, randomness);
        const siloedNoteHash = await siloNoteHash(contractAddress, noteHash);
        const uniqueNoteHash = await computeUniqueNoteHash(noteNonce, siloedNoteHash);
        return uniqueNoteHash;
      });

      await insertLeaves(consumedNotes);

      const args = [recipient];
      const { entrypoint: result } = await runSimulator({
        args,
        artifact: StatefulTestContractArtifact,
        anchorBlockHeader,
        functionName: 'destroy_and_create_no_init_check',
        msgSender: owner,
        contractAddress,
      });

      const nullifiers = result.publicInputs.nullifiers;
      expect(nullifiers.claimedLength).toBe(consumedNotes.length);

      // We've inserted just one note for recipient with hardcoded value 92
      expect(result.newNotes).toHaveLength(1);
      expect(result.newNotes[0].note.items[0]).toEqual(new Fr(92n));

      const privateLogs = result.publicInputs.privateLogs;
      expect(privateLogs.claimedLength).toBe(1);
    });
  });

  describe('nested calls', () => {
    const privateIncrement = txContextFields.chainId.value + txContextFields.version.value;

    it('child function should be callable', async () => {
      const initialValue = 100n;
      const { entrypoint: result } = await runSimulator({
        args: [initialValue],
        artifact: ChildContractArtifact,
        anchorBlockHeader,
        functionName: 'value',
      });

      expect(result.returnValues).toEqual([new Fr(initialValue + privateIncrement)]);
    });

    it('parent should call child', async () => {
      const childArtifact = getFunctionArtifactByName(ChildContractArtifact, 'value');
      const parentAddress = await mockContractInstance(ParentContractArtifact);
      const childAddress = await mockContractInstance(ChildContractArtifact);
      const childSelector = await FunctionSelector.fromNameAndParameters(childArtifact.name, childArtifact.parameters);

      logger.info(`Parent deployed at ${parentAddress.toString()}`);
      logger.info(`Calling child function ${childSelector.toString()} at ${childAddress.toString()}`);

      const args = [childAddress, childSelector];
      const { entrypoint: result } = await runSimulator({
        args,
        artifact: ParentContractArtifact,
        anchorBlockHeader,
        functionName: 'entry_point',
        contractAddress: parentAddress,
      });

      expect(result.returnValues).toEqual([new Fr(privateIncrement)]);

      expect(
        contractStore.getFunctionArtifact.mock.calls.some(
          ([addr, sel]) => addr.equals(childAddress) && sel.equals(childSelector),
        ),
      ).toBe(true);
      expect(result.nestedExecutionResults).toHaveLength(1);
      expect(result.nestedExecutionResults[0].returnValues).toEqual([new Fr(privateIncrement)]);
      expect(result.publicInputs.privateCallRequests.array[0].callContext).toEqual(
        result.nestedExecutionResults[0].publicInputs.callContext,
      );
    });

    it('syncs private state for child in nested calls', async () => {
      const childArtifact = getFunctionArtifactByName(ChildContractArtifact, 'value');
      const parentAddress = await mockContractInstance(ParentContractArtifact);
      const childAddress = await mockContractInstance(ChildContractArtifact);
      const childSelector = await FunctionSelector.fromNameAndParameters(childArtifact.name, childArtifact.parameters);

      contractStore.getFunctionCall.mockClear();

      const args = [childAddress, childSelector];
      await runSimulator({
        args,
        artifact: ParentContractArtifact,
        anchorBlockHeader,
        functionName: 'entry_point',
        contractAddress: parentAddress,
      });

      expect(contractStore.getFunctionCall).toHaveBeenCalledWith('sync_state', [owner], childAddress);
    });
  });

  describe('consuming messages', () => {
    let contractAddress: AztecAddress;

    beforeEach(async () => {
      contractAddress = await mockContractInstance(TestContractArtifact);
    });
    describe('L1 to L2', () => {
      let bridgedAmount = 100n;

      const l1ToL2MessageIndex = 0;
      let secretForL1ToL2MessageConsumption = new Fr(1n);

      let crossChainMsgRecipient: AztecAddress | undefined;
      let crossChainMsgSender: EthAddress | undefined;

      let preimage: L1ToL2Message;

      let args: any[];

      beforeEach(() => {
        bridgedAmount = 100n;
        secretForL1ToL2MessageConsumption = new Fr(2n);

        crossChainMsgRecipient = undefined;
        crossChainMsgSender = undefined;
      });

      const computePreimage = () =>
        buildL1ToL2Message(
          toFunctionSelector('mint_to_private(uint256)').substring(2),
          [new Fr(bridgedAmount)],
          crossChainMsgRecipient ?? contractAddress,
          secretForL1ToL2MessageConsumption,
          l1ToL2MessageIndex,
        );

      const computeArgs = () => [
        bridgedAmount,
        secretForL1ToL2MessageConsumption,
        crossChainMsgSender ?? preimage.sender.sender,
        l1ToL2MessageIndex,
      ];

      const mockOracles = async () => {
        await insertLeaves([preimage.hash()], 'l1ToL2Messages');
        aztecNode.getL1ToL2MessageMembershipWitness.mockImplementation(async () => {
          return Promise.resolve([0n, await fork.getSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, 0n)]);
        });
        aztecNode.findLeavesIndexes.mockImplementation(() => {
          return Promise.resolve([]);
        });
      };

      it('Should be able to consume a dummy cross chain message', async () => {
        preimage = await computePreimage();
        args = computeArgs();
        await mockOracles();

        const result = await runSimulator({
          contractAddress,
          artifact: TestContractArtifact,
          anchorBlockHeader,
          functionName: 'consume_mint_to_private_message',
          args,
          txContext: { version: new Fr(1n), chainId: new Fr(1n) },
        });

        // Check a nullifier has been inserted
        const nullifiers = result.entrypoint.publicInputs.nullifiers;
        expect(nullifiers.claimedLength).toBe(1);
      });

      it('Invalid membership proof', async () => {
        preimage = await computePreimage();

        args = computeArgs();

        // mockOracles advances the current block, but in this case we want to simulate
        // the state where PXE hasn't learned about the new block yet
        const previousAnchorBlock = anchorBlockHeader;
        await mockOracles();

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
            anchorBlockHeader: previousAnchorBlock,
            functionName: 'consume_mint_to_private_message',
            args,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrow('Message not in state');
      });

      it('Invalid recipient', async () => {
        crossChainMsgRecipient = await AztecAddress.random();

        preimage = await computePreimage();

        args = computeArgs();

        await mockOracles();

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
            anchorBlockHeader,
            functionName: 'consume_mint_to_private_message',
            args,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrow('Message not in state');
      });

      it('Invalid sender', async () => {
        crossChainMsgSender = EthAddress.random();
        preimage = await computePreimage();

        args = computeArgs();

        await mockOracles();

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
            anchorBlockHeader,
            functionName: 'consume_mint_to_private_message',
            args,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrow('Message not in state');
      });

      it('Invalid chainid', async () => {
        preimage = await computePreimage();

        args = computeArgs();

        await mockOracles();

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
            anchorBlockHeader,
            functionName: 'consume_mint_to_private_message',
            args,
            txContext: { version: new Fr(1n), chainId: new Fr(2n) },
          }),
        ).rejects.toThrow('Message not in state');
      });

      it('Invalid version', async () => {
        preimage = await computePreimage();

        args = computeArgs();

        await mockOracles();

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
            anchorBlockHeader,
            functionName: 'consume_mint_to_private_message',
            args,
            txContext: { version: new Fr(2n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrow('Message not in state');
      });

      it('Invalid content', async () => {
        preimage = await computePreimage();

        bridgedAmount = bridgedAmount + 1n; // Invalid amount
        args = computeArgs();

        await mockOracles();

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
            anchorBlockHeader,
            functionName: 'consume_mint_to_private_message',
            args,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrow('Message not in state');
      });

      it('Invalid Secret', async () => {
        preimage = await computePreimage();

        secretForL1ToL2MessageConsumption = Fr.random();
        args = computeArgs();

        await mockOracles();

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
            anchorBlockHeader,
            functionName: 'consume_mint_to_private_message',
            args,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrow('Message not in state');
      });
    });
  });

  describe('enqueued calls', () => {
    it.each([false, true])('parent should enqueue call to child (is #[only_self]: %p)', async isOnlySelf => {
      const childContractArtifact = structuredClone(ChildContractArtifact);
      const childFunctionArtifact = childContractArtifact.functions.find(fn => fn.name === 'public_dispatch')!;
      expect(childFunctionArtifact).toBeDefined();
      childFunctionArtifact.isOnlySelf = isOnlySelf;

      const childAddress = await mockContractInstance(childContractArtifact);
      const childSelector = await FunctionSelector.fromSignature('pub_set_value(Field)');
      const parentAddress = await mockContractInstance(ParentContractArtifact);

      const args = [childAddress, childSelector, 42n];
      const result = await runSimulator({
        msgSender: parentAddress,
        contractAddress: parentAddress,
        anchorBlockHeader,
        artifact: ParentContractArtifact,
        functionName: 'enqueue_call_to_child',
        args,
      });

      const childCalldata = await HashedValues.fromCalldata([childSelector.toField(), new Fr(42n)]);

      expect(result.publicFunctionCalldata).toEqual([childCalldata]);
    });
    it('should be ok for parent to enqueue calls with <= max total args', async () => {
      // This function recurses and calls itself, so we need to mock retrieval of its own contract instance (parent)
      // Recursions test that total args are enforced across nested calls
      const parentContractArtifact = structuredClone(ParentContractArtifact);
      const parentFunctionArtifact = parentContractArtifact.functions.find(fn => fn.name === 'public_dispatch')!;
      expect(parentFunctionArtifact).toBeDefined();

      const parentAddress = await mockContractInstance(parentContractArtifact);

      // Only recurse once, so that we only enqueue 2 calls. #total-args should be low.
      const args = [/*remainingRecursions=*/ 1];
      await runSimulator({
        msgSender: parentAddress,
        contractAddress: parentAddress,
        anchorBlockHeader,
        artifact: parentContractArtifact,
        functionName: 'enqueue_call_to_child_with_many_args_and_recurse',
        args,
      });
    });
    it('(prevent foot guns) should error if parent enqueues two public calls with too many TOTAL args', async () => {
      // This function recurses and calls itself, so we need to mock retrieval of its own contract instance (parent)
      // Recursions test that total args are enforced across nested calls
      const parentContractArtifact = structuredClone(ParentContractArtifact);
      const parentFunctionArtifact = parentContractArtifact.functions.find(fn => fn.name === 'public_dispatch')!;
      expect(parentFunctionArtifact).toBeDefined();

      const parentAddress = await mockContractInstance(parentContractArtifact);

      // 10 recursions (11 enqueued public calls) should overflow the total args limit
      // since each call enqueues a call with max / 10 args (plus 1 each time for function selector)
      const args = [/*remainingRecursions=*/ 10];
      await expect(
        runSimulator({
          msgSender: parentAddress,
          contractAddress: parentAddress,
          anchorBlockHeader,
          artifact: parentContractArtifact,
          functionName: 'enqueue_call_to_child_with_many_args_and_recurse',
          args,
        }),
      ).rejects.toThrow(/Too many total args to all enqueued public calls/);
    });

    it('should error if parent and nested private call enqueue public calls with too many TOTAL args', async () => {
      const contractArtifact = structuredClone(CalldataLimitTestContractArtifact);
      const contractAddress = await mockContractInstance(contractArtifact);

      await expect(
        runSimulator({
          msgSender: contractAddress,
          contractAddress: contractAddress,
          anchorBlockHeader,
          artifact: contractArtifact,
          functionName: 'exceed_calldata_limit_via_nested_call',
        }),
      ).rejects.toThrow(/Too many total args to all enqueued public calls/);
    });
  });

  describe('setting teardown function', () => {
    it('should be able to set a teardown function', async () => {
      const { entrypoint: result, publicFunctionCalldata } = await runSimulator({
        artifact: TestContractArtifact,
        anchorBlockHeader,
        functionName: 'test_setting_teardown',
      });
      expect(result.publicInputs.publicTeardownCallRequest.isEmpty()).toBe(false);
      expect(result.publicInputs.publicTeardownCallRequest.calldataHash).toEqual(publicFunctionCalldata[0].hash);
      expect(publicFunctionCalldata[0].values[0]).toEqual(
        (await FunctionSelector.fromNameAndParameters('dummy_public_call', [])).toField(),
      );
    });
  });

  describe('setting fee payer', () => {
    it('should default to not being a fee payer', async () => {
      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        anchorBlockHeader,
        functionName: 'get_this_address',
      });
      expect(result.publicInputs.isFeePayer).toBe(false);
    });

    it('should be able to set a fee payer', async () => {
      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        anchorBlockHeader,
        functionName: 'test_setting_fee_payer',
      });
      expect(result.publicInputs.isFeePayer).toBe(true);
    });
  });

  describe('phase checking', () => {
    it('should be able to end setup checking phases', async () => {
      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        anchorBlockHeader,
        functionName: 'end_setup_checking_phases',
      });
      const minRevertibleSideEffectCounter = result.publicInputs.minRevertibleSideEffectCounter.toNumber();
      const expectedNonRevertibleSideEffectCounter =
        result.publicInputs.expectedNonRevertibleSideEffectCounter.toNumber();
      const expectedRevertibleSideEffectCounter = result.publicInputs.expectedRevertibleSideEffectCounter.toNumber();
      expect(expectedNonRevertibleSideEffectCounter).toBeGreaterThan(0);
      expect(expectedRevertibleSideEffectCounter).toBeGreaterThan(0);
      expect(expectedNonRevertibleSideEffectCounter < minRevertibleSideEffectCounter).toBe(true);
      expect(expectedRevertibleSideEffectCounter >= minRevertibleSideEffectCounter).toBe(true);
    });
  });

  describe('pending note hashes contract', () => {
    it('should be able to insert, read, and nullify pending note hashes in one call', async () => {
      noteStore.getNotes.mockResolvedValue([]);

      const amountToTransfer = 100n;

      const contractAddress = await mockContractInstance(PendingNoteHashesContractArtifact);
      const sender = owner;
      const args = [amountToTransfer, owner, sender];
      const { entrypoint: result } = await runSimulator({
        args: args,
        artifact: PendingNoteHashesContractArtifact,
        functionName: 'test_insert_then_get_then_nullify_flat',
        contractAddress,
        anchorBlockHeader,
      });

      expect(result.newNotes).toHaveLength(1);
      const noteAndSlot = result.newNotes[0];
      expect(noteAndSlot.storageSlot).toEqual(PendingNoteHashesContractArtifact.storageLayout['balances'].slot);

      expect(noteAndSlot.note.items[0]).toEqual(new Fr(amountToTransfer));

      const noteHashesFromCall = result.publicInputs.noteHashes;
      expect(noteHashesFromCall.claimedLength).toBe(1);

      const noteHashFromCall = noteHashesFromCall.array[0].value;
      const storageSlot = PendingNoteHashesContractArtifact.storageLayout['balances'].slot;

      const derivedNoteHash = await computeNoteHash(noteAndSlot.note, owner, storageSlot, noteAndSlot.randomness);
      expect(noteHashFromCall).toEqual(derivedNoteHash);

      const privateLogs = result.publicInputs.privateLogs;
      expect(privateLogs.claimedLength).toBe(1);

      // read request should match a note hash for pending notes (there is no nonce, so can't compute "unique" hash)
      const readRequest = result.publicInputs.noteHashReadRequests.array[0];
      expect(readRequest.value).toEqual(derivedNoteHash);

      expect(result.returnValues).toEqual([new Fr(amountToTransfer)]);

      const nullifier = result.publicInputs.nullifiers.array[0];
      const expectedNullifier = await poseidon2HashWithSeparator(
        [derivedNoteHash, await computeAppNullifierHidingKey(ownerNhkM, contractAddress)],
        DomainSeparator.NOTE_NULLIFIER,
      );
      expect(nullifier.value).toEqual(expectedNullifier);
    });

    it('should be able to insert, read, and nullify pending note hashes in nested calls', async () => {
      noteStore.getNotes.mockResolvedValue([]);

      const amountToTransfer = 100n;

      const contractAddress = await AztecAddress.random();

      const insertArtifact = getFunctionArtifactByName(PendingNoteHashesContractArtifact, 'insert_note');

      const getThenNullifyArtifact = getFunctionArtifactByName(
        PendingNoteHashesContractArtifact,
        'get_then_nullify_note',
      );

      const insertFnSelector = await FunctionSelector.fromNameAndParameters(
        insertArtifact.name,
        insertArtifact.parameters,
      );
      const getThenNullifyFnSelector = await FunctionSelector.fromNameAndParameters(
        getThenNullifyArtifact.name,
        getThenNullifyArtifact.parameters,
      );

      const sender = owner;
      const args = [amountToTransfer, owner, sender, insertFnSelector.toField(), getThenNullifyFnSelector.toField()];
      const { entrypoint: result } = await runSimulator({
        args: args,
        artifact: PendingNoteHashesContractArtifact,
        functionName: 'test_insert_then_get_then_nullify_all_in_nested_calls',
        contractAddress: contractAddress,
        anchorBlockHeader,
      });

      const execInsert = result.nestedExecutionResults[0];
      const execGetThenNullify = result.nestedExecutionResults[1];

      const storageSlot = PendingNoteHashesContractArtifact.storageLayout['balances'].slot;

      expect(execInsert.newNotes).toHaveLength(1);
      const noteAndSlot = execInsert.newNotes[0];
      expect(noteAndSlot.storageSlot).toEqual(storageSlot);

      expect(noteAndSlot.note.items[0]).toEqual(new Fr(amountToTransfer));

      const noteHashes = execInsert.publicInputs.noteHashes;
      expect(noteHashes.claimedLength).toBe(1);

      const derivedNoteHash = await computeNoteHash(noteAndSlot.note, owner, storageSlot, noteAndSlot.randomness);
      expect(noteHashes.array[0].value).toEqual(derivedNoteHash);

      const privateLogs = execInsert.publicInputs.privateLogs;
      expect(privateLogs.claimedLength).toBe(1);

      // read request should match a note hash for pending notes (there is no nonce, so can't compute "unique" hash)
      const readRequest = execGetThenNullify.publicInputs.noteHashReadRequests.array[0];
      expect(readRequest.value).toEqual(derivedNoteHash);

      expect(execGetThenNullify.returnValues).toEqual([new Fr(amountToTransfer)]);

      const nullifier = execGetThenNullify.publicInputs.nullifiers.array[0];
      const expectedNullifier = await poseidon2HashWithSeparator(
        [derivedNoteHash, await computeAppNullifierHidingKey(ownerNhkM, contractAddress)],
        DomainSeparator.NOTE_NULLIFIER,
      );
      expect(nullifier.value).toEqual(expectedNullifier);
    });

    it('cant read a commitment that is inserted later in same call', async () => {
      noteStore.getNotes.mockResolvedValue([]);

      const amountToTransfer = 100n;

      const contractAddress = await AztecAddress.random();

      const args = [amountToTransfer, owner];
      // This will throw if we read the note before it was inserted
      await runSimulator({
        args: args,
        artifact: PendingNoteHashesContractArtifact,
        functionName: 'test_bad_get_then_insert_flat',
        contractAddress,
        anchorBlockHeader,
      });
    });
  });

  describe('get master incoming viewing public key', () => {
    it('gets the public key for an address', async () => {
      // Generate a partial address, pubkey, and resulting address
      const completeAddress = await CompleteAddress.random();
      const args = [completeAddress.address];
      const pubKey = completeAddress.publicKeys.ivpkM;

      addressStore.getCompleteAddress.mockResolvedValue(completeAddress);
      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        functionName: 'get_master_incoming_viewing_public_key',
        args,
        anchorBlockHeader,
      });
      expect(result.returnValues).toEqual([pubKey.x, pubKey.y]);
    });
  });

  describe('Get notes', () => {
    it('fails if returning no notes', async () => {
      // call_get_notes(owner: AztecAddress, storage_slot: Field, active_or_nullified: bool)
      const args = [owner, 2n, true];
      noteStore.getNotes.mockResolvedValue([]);

      await expect(() =>
        runSimulator({ artifact: TestContractArtifact, functionName: 'call_get_notes', args, anchorBlockHeader }),
      ).rejects.toThrow(`Assertion failed: Attempted to read past end of BoundedVec`);
    });
  });

  describe('Context oracles', () => {
    it('this_address should return the current context address', async () => {
      const contractAddress = await mockContractInstance(TestContractArtifact);

      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        functionName: 'get_this_address',
        args: [],
        contractAddress,
        anchorBlockHeader,
      });
      expect(result.returnValues).toEqual([contractAddress.toField()]);
    });
  });

  describe('Private global variables', () => {
    let chainId: Fr;
    let version: Fr;
    let args: any[];

    beforeEach(() => {
      chainId = Fr.random();
      version = Fr.random();
      args = [chainId, version];
    });

    it('Private global vars are correctly set', async () => {
      // Chain id and version set in tx context is the same as the ones we pass via args so this should not throw
      await runSimulator({
        artifact: TestContractArtifact,
        functionName: 'assert_private_global_vars',
        msgSender: owner,
        args,
        txContext: { chainId, version },
        anchorBlockHeader,
      });
    });

    it('Throws when chainId is incorrectly set', async () => {
      // We set the chainId in the tx context to a different value than the one we pass via args so the simulator should throw
      const unexpectedChainId = Fr.random();
      await expect(() =>
        runSimulator({
          artifact: TestContractArtifact,
          functionName: 'assert_private_global_vars',
          msgSender: owner,
          args,
          txContext: { chainId: unexpectedChainId, version },
          anchorBlockHeader,
        }),
      ).rejects.toThrow('Invalid chain id');
    });

    it('Throws when version is incorrectly set', async () => {
      // We set the version in the tx context to a different value than the one we pass via args so the simulator should throw
      const unexpectedVersion = Fr.random();
      await expect(() =>
        runSimulator({
          artifact: TestContractArtifact,
          functionName: 'assert_private_global_vars',
          msgSender: owner,
          args,
          txContext: { chainId, version: unexpectedVersion },
          anchorBlockHeader,
        }),
      ).rejects.toThrow('Invalid version');
    });
  });

  describe('Anchor header in private context', () => {
    beforeEach(() => {
      anchorBlockHeader = makeBlockHeader();
    });

    it('Header is correctly set', async () => {
      const args = [await anchorBlockHeader.hash()];

      await runSimulator({
        artifact: TestContractArtifact,
        functionName: 'assert_header_private',
        msgSender: owner,
        args,
        anchorBlockHeader,
      });
    });

    it('Throws when header is not as expected', async () => {
      const unexpectedHeaderHash = Fr.random();
      const args = [unexpectedHeaderHash];

      await expect(() =>
        runSimulator({
          artifact: TestContractArtifact,
          functionName: 'assert_header_private',
          msgSender: owner,
          args,
          anchorBlockHeader,
        }),
      ).rejects.toThrow('Invalid header hash');
    });
  });
});
