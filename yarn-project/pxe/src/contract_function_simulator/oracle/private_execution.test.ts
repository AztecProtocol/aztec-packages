import {
  GeneratorIndex,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NULL_MSG_SENDER_CONTRACT_ADDRESS,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
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
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { type AppendOnlyTree, Poseidon, StandardTree, newTree } from '@aztec/merkle-tree';
import { ChildContractArtifact } from '@aztec/noir-test-contracts.js/Child';
import { ParentContractArtifact } from '@aztec/noir-test-contracts.js/Parent';
import { PendingNoteHashesContractArtifact } from '@aztec/noir-test-contracts.js/PendingNoteHashes';
import { StatefulTestContractArtifact } from '@aztec/noir-test-contracts.js/StatefulTest';
import { TestContractArtifact } from '@aztec/noir-test-contracts.js/Test';
import { WASMSimulator } from '@aztec/simulator/client';
import {
  type ContractArtifact,
  FunctionSelector,
  encodeArguments,
  getFunctionArtifact,
  getFunctionArtifactByName,
} from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { type BlockParameter, L2BlockHash } from '@aztec/stdlib/block';
import {
  CompleteAddress,
  type ContractInstanceWithAddress,
  getContractClassFromArtifact,
  getContractInstanceFromInstantiationParams,
} from '@aztec/stdlib/contract';
import { GasFees, GasSettings } from '@aztec/stdlib/gas';
import { computeNoteHashNonce, computeSecretHash, computeUniqueNoteHash, siloNoteHash } from '@aztec/stdlib/hash';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { KeyValidationRequest } from '@aztec/stdlib/kernel';
import { computeAppNullifierSecretKey, deriveKeys } from '@aztec/stdlib/keys';
import type { SiloedTag } from '@aztec/stdlib/logs';
import { L1Actor, L1ToL2Message, L2Actor } from '@aztec/stdlib/messaging';
import { Note, NoteDao } from '@aztec/stdlib/note';
import { makeBlockHeader, makeL2Tips } from '@aztec/stdlib/testing';
import { AppendOnlyTreeSnapshot } from '@aztec/stdlib/trees';
import {
  BlockHeader,
  HashedValues,
  PartialStateReference,
  StateReference,
  TxContext,
  TxExecutionRequest,
  TxHash,
} from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { Matcher, type MatcherCreator, type MockProxy, mock } from 'jest-mock-extended';
import { toFunctionSelector } from 'viem';

import type { AddressStore } from '../../storage/address_store/address_store.js';
import type { AnchorBlockStore } from '../../storage/anchor_block_store/anchor_block_store.js';
import type { CapsuleStore } from '../../storage/capsule_store/capsule_store.js';
import type { ContractStore } from '../../storage/contract_store/contract_store.js';
import type { NoteStore } from '../../storage/note_store/note_store.js';
import type { PrivateEventStore } from '../../storage/private_event_store/private_event_store.js';
import type { RecipientTaggingStore } from '../../storage/tagging_store/recipient_tagging_store.js';
import type { SenderAddressBookStore } from '../../storage/tagging_store/sender_address_book_store.js';
import type { SenderTaggingStore } from '../../storage/tagging_store/sender_tagging_store.js';
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
  let senderAddressBookStore: MockProxy<SenderAddressBookStore>;
  let aztecNode: MockProxy<AztecNode>;
  let anchorBlockStore: MockProxy<AnchorBlockStore>;
  let capsuleStore: MockProxy<CapsuleStore>;
  let privateEventStore: MockProxy<PrivateEventStore>;
  let acirSimulator: ContractFunctionSimulator;
  let anchorBlockHeader = BlockHeader.empty();
  let logger: Logger;

  let defaultContractAddress: AztecAddress;
  const ownerSk = Fr.fromHexString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');
  const recipientSk = Fr.fromHexString('0c9ed344548e8f9ba8aa3c9f8651eaa2853130f6c1e9c050ccf198f7ea18a7ec');
  const senderForTagsSk = Fr.fromHexString('2f0e5a8f3ba9c0738d6f3a9e0c2e13f7b2d4207f36efda729a2c6e2a5a9f8b1d');
  let owner: AztecAddress;
  let recipient: AztecAddress;
  let senderForTags: AztecAddress;
  let ownerCompleteAddress: CompleteAddress;
  let recipientCompleteAddress: CompleteAddress;
  let senderForTagsCompleteAddress: CompleteAddress;

  let ownerNskM: GrumpkinScalar;
  let recipientNskM: GrumpkinScalar;
  let senderForTagsNskM: GrumpkinScalar;
  let ownerIvskM: GrumpkinScalar;
  let recipientIvskM: GrumpkinScalar;
  let senderForTagsIvskM: GrumpkinScalar;

  const TEST_JOB_ID = 'test-job-id';

  const treeHeights: { [name: string]: number } = {
    noteHash: NOTE_HASH_TREE_HEIGHT,
    l1ToL2Messages: L1_TO_L2_MSG_TREE_HEIGHT,
    publicData: PUBLIC_DATA_TREE_HEIGHT,
  };

  let trees: { [name: keyof typeof treeHeights]: AppendOnlyTree<Fr> } = {};
  const txContextFields: FieldsOf<TxContext> = {
    chainId: new Fr(10),
    version: new Fr(20),
    gasSettings: GasSettings.default({ maxFeesPerGas: new GasFees(10, 10) }),
  };

  let contracts: { [address: string]: ContractArtifact };

  // expectedValue is optional
  const aztecAddressMatcher: MatcherCreator<AztecAddress> = expectedValue =>
    new Matcher(actualValue => {
      return expectedValue?.toString() === actualValue.toString();
    }, 'Matches aztec addresses');

  const mockContractInstance = async (artifact: ContractArtifact, address: AztecAddress) => {
    contracts[address.toString()] = artifact;
    const contractClass = await getContractClassFromArtifact(artifact);

    contractStore.getContractInstance.calledWith(aztecAddressMatcher(address)).mockResolvedValue({
      currentContractClassId: contractClass.id,
      originalContractClassId: contractClass.id,
      address,
    } as ContractInstanceWithAddress);
  };

  const runSimulator = async ({
    artifact,
    functionName,
    anchorBlockHeader,
    args = [],
    /** Notice that we're defaulting to the "null" msg_sender, which many public functions will fail to unwrap, and will revert. */
    msgSender = AztecAddress.fromBigInt(NULL_MSG_SENDER_CONTRACT_ADDRESS),
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
    contractAddress = contractAddress ?? defaultContractAddress;
    const selector = await FunctionSelector.fromNameAndParameters(functionName, functionArtifact.parameters);
    await mockContractInstance(artifact, contractAddress);

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

    return acirSimulator.run(
      txRequest,
      contractAddress,
      selector,
      msgSender,
      anchorBlockHeader,
      senderForTags,
      undefined,
      TEST_JOB_ID,
    );
  };

  const insertLeaves = async (leaves: Fr[], name = 'noteHash') => {
    if (!treeHeights[name]) {
      throw new Error(`Unknown tree ${name}`);
    }
    if (!trees[name]) {
      const db = openTmpStore();
      const poseidon = new Poseidon();
      trees[name] = await newTree(StandardTree, db, poseidon, name, Fr, treeHeights[name]);
    }
    const tree = trees[name];

    tree.appendLeaves(leaves);

    // Create a new snapshot.
    const newSnap = new AppendOnlyTreeSnapshot(Fr.fromBuffer(tree.getRoot(true)), Number(tree.getNumLeaves(true)));

    if (name === 'noteHash' || name === 'l1ToL2Messages' || name === 'publicData') {
      anchorBlockHeader = new BlockHeader(
        anchorBlockHeader.lastArchive,
        new StateReference(
          name === 'l1ToL2Messages' ? newSnap : anchorBlockHeader.state.l1ToL2MessageTree,
          new PartialStateReference(
            name === 'noteHash' ? newSnap : anchorBlockHeader.state.partial.noteHashTree,
            anchorBlockHeader.state.partial.nullifierTree,
            name === 'publicData' ? newSnap : anchorBlockHeader.state.partial.publicDataTree,
          ),
        ),
        anchorBlockHeader.spongeBlobHash,
        anchorBlockHeader.globalVariables,
        anchorBlockHeader.totalFees,
        anchorBlockHeader.totalManaUsed,
      );
    } else {
      anchorBlockHeader = new BlockHeader(
        anchorBlockHeader.lastArchive,
        new StateReference(newSnap, anchorBlockHeader.state.partial),
        anchorBlockHeader.spongeBlobHash,
        anchorBlockHeader.globalVariables,
        anchorBlockHeader.totalFees,
        anchorBlockHeader.totalManaUsed,
      );
    }

    return trees[name];
  };

  const computeNoteHash = (note: Note, owner: AztecAddress, storageSlot: Fr, randomness: Fr) => {
    // We're assuming here that the note hash function is the default one injected by the #[note] macro.
    return poseidon2HashWithSeparator(
      [...note.items, owner.toField(), storageSlot, randomness],
      GeneratorIndex.NOTE_HASH,
    );
  };

  beforeAll(async () => {
    logger = createLogger('simulator:test:private_execution');

    const ownerPartialAddress = Fr.random();
    ownerCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(ownerSk, ownerPartialAddress);
    ({ masterNullifierSecretKey: ownerNskM, masterIncomingViewingSecretKey: ownerIvskM } = await deriveKeys(ownerSk));

    const recipientPartialAddress = Fr.random();
    recipientCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(
      recipientSk,
      recipientPartialAddress,
    );
    ({ masterNullifierSecretKey: recipientNskM, masterIncomingViewingSecretKey: recipientIvskM } =
      await deriveKeys(recipientSk));

    const senderForTagsPartialAddress = Fr.random();
    senderForTagsCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(
      senderForTagsSk,
      senderForTagsPartialAddress,
    );
    ({ masterNullifierSecretKey: senderForTagsNskM, masterIncomingViewingSecretKey: senderForTagsIvskM } =
      await deriveKeys(senderForTagsSk));

    owner = ownerCompleteAddress.address;
    recipient = recipientCompleteAddress.address;
    senderForTags = senderForTagsCompleteAddress.address;

    defaultContractAddress = await AztecAddress.random();
  });

  beforeEach(async () => {
    trees = {};
    contractStore = mock<ContractStore>();
    noteStore = mock<NoteStore>();
    noteStore.getNotes.mockResolvedValue([]);
    addressStore = mock<AddressStore>();
    senderTaggingStore = mock<SenderTaggingStore>();
    recipientTaggingStore = mock<RecipientTaggingStore>();
    aztecNode = mock<AztecNode>();
    keyStore = mock<KeyStore>();
    anchorBlockStore = mock<AnchorBlockStore>();
    capsuleStore = mock<CapsuleStore>();
    privateEventStore = mock<PrivateEventStore>();
    senderAddressBookStore = mock<SenderAddressBookStore>();
    contracts = {};
    anchorBlockHeader = makeBlockHeader();
    anchorBlockStore.getBlockHeader.mockImplementation(() => Promise.resolve(anchorBlockHeader));
    capsuleStore.readCapsuleArray.mockResolvedValue([]);

    // Mock sender tagging data provider methods
    senderTaggingStore.getLastFinalizedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getLastUsedIndex.mockResolvedValue(undefined);
    senderTaggingStore.getTxHashesOfPendingIndexes.mockResolvedValue([]);
    senderTaggingStore.storePendingIndexes.mockResolvedValue();

    senderAddressBookStore.getSenders.mockResolvedValue([]);

    // Mock aztec node methods - the return array needs to have the same length as the number of tags
    // on the input.
    aztecNode.getPrivateLogsByTags.mockImplementation((tags: SiloedTag[]) => Promise.resolve(tags.map(() => [])));

    // Mock getL2Tips and getBlockHeader for loadPrivateLogsForSenderRecipientPair
    aztecNode.getL2Tips.mockResolvedValue(makeL2Tips(anchorBlockHeader.globalVariables.blockNumber));
    aztecNode.getBlockHeader.mockImplementation((blockNumber: BlockNumber | 'latest') => {
      if (blockNumber === 'latest') {
        return Promise.resolve(anchorBlockHeader);
      }
      return Promise.resolve(anchorBlockHeader);
    });

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

    keyStore.getKeyValidationRequest.mockImplementation(async (pkMHash: Fr, contractAddress: AztecAddress) => {
      if (pkMHash.equals(await ownerCompleteAddress.publicKeys.masterNullifierPublicKey.hash())) {
        return Promise.resolve(
          new KeyValidationRequest(
            ownerCompleteAddress.publicKeys.masterNullifierPublicKey,
            await computeAppNullifierSecretKey(ownerNskM, contractAddress),
          ),
        );
      }
      if (pkMHash.equals(await recipientCompleteAddress.publicKeys.masterNullifierPublicKey.hash())) {
        return Promise.resolve(
          new KeyValidationRequest(
            recipientCompleteAddress.publicKeys.masterNullifierPublicKey,
            await computeAppNullifierSecretKey(recipientNskM, contractAddress),
          ),
        );
      }
      if (pkMHash.equals(await senderForTagsCompleteAddress.publicKeys.masterNullifierPublicKey.hash())) {
        return Promise.resolve(
          new KeyValidationRequest(
            senderForTagsCompleteAddress.publicKeys.masterNullifierPublicKey,
            await computeAppNullifierSecretKey(senderForTagsNskM, contractAddress),
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
      return {
        name: functionArtifact.name,
        args: encodeArguments(functionArtifact, args),
        selector: await FunctionSelector.fromNameAndParameters(functionArtifact.name, functionArtifact.parameters),
        type: functionArtifact.functionType,
        to,
        hideMsgSender: false,
        isStatic: functionArtifact.isStatic,
        returnTypes: functionArtifact.returnTypes,
      };
    });
    contractStore.syncState.mockImplementation(async (contractAddress, _functionSelector, _executor) => {
      await contractStore.getFunctionCall('sync_state', [], contractAddress);
    });

    capsuleStore.loadCapsule.mockImplementation((_, __) => Promise.resolve(null));

    aztecNode.getPublicStorageAt.mockImplementation(
      (_block: BlockParameter, _address: AztecAddress, _storageSlot: Fr) => {
        return Promise.resolve(Fr.ZERO);
      },
    );

    acirSimulator = new ContractFunctionSimulator(
      contractStore,
      noteStore,
      keyStore,
      addressStore,
      aztecNode,
      anchorBlockStore,
      senderTaggingStore,
      recipientTaggingStore,
      senderAddressBookStore,
      capsuleStore,
      privateEventStore,
      simulator,
    );
  });

  describe('no constructor', () => {
    it('emits a field array as an encrypted log', async () => {
      const args = [times(5, () => Fr.random()), owner, false];
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
        L2BlockHash.random().toString(),
        0,
        0,
      );
    };

    beforeEach(async () => {
      contractAddress = await AztecAddress.random();

      await mockContractInstance(StatefulTestContractArtifact, contractAddress);
    });

    it('should have a constructor with arguments that inserts notes', async () => {
      const initArgs = [owner, owner, 140];
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
        msgSender: AztecAddress.fromNumber(1234),
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
        args: [owner, owner, 140],
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
      const parentAddress = await AztecAddress.random();
      const childAddress = await AztecAddress.random();
      const childSelector = await FunctionSelector.fromNameAndParameters(childArtifact.name, childArtifact.parameters);

      await mockContractInstance(ChildContractArtifact, childAddress);
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

      // First fetch of the function artifact is the parent contract
      expect(contractStore.getFunctionArtifact.mock.calls[1]).toEqual([childAddress, childSelector]);
      expect(result.nestedExecutionResults).toHaveLength(1);
      expect(result.nestedExecutionResults[0].returnValues).toEqual([new Fr(privateIncrement)]);
      expect(result.publicInputs.privateCallRequests.array[0].callContext).toEqual(
        result.nestedExecutionResults[0].publicInputs.callContext,
      );
    });

    it('syncs private state for child in nested calls', async () => {
      const childArtifact = getFunctionArtifactByName(ChildContractArtifact, 'value');
      const parentAddress = await AztecAddress.random();
      const childAddress = await AztecAddress.random();
      const childSelector = await FunctionSelector.fromNameAndParameters(childArtifact.name, childArtifact.parameters);

      await mockContractInstance(ChildContractArtifact, childAddress);

      contractStore.getFunctionCall.mockClear();

      const args = [childAddress, childSelector];
      await runSimulator({
        args,
        artifact: ParentContractArtifact,
        anchorBlockHeader,
        functionName: 'entry_point',
        contractAddress: parentAddress,
      });

      expect(contractStore.getFunctionCall).toHaveBeenCalledWith('sync_state', [], childAddress);
    });
  });

  describe('consuming messages', () => {
    let contractAddress: AztecAddress;

    beforeEach(async () => {
      contractAddress = await AztecAddress.random();
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
        const tree = await insertLeaves([preimage.hash()], 'l1ToL2Messages');
        aztecNode.getL1ToL2MessageMembershipWitness.mockImplementation(async () => {
          return Promise.resolve([0n, await tree.getSiblingPath(0n, true)]);
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

      const childAddress = await AztecAddress.random();
      await mockContractInstance(childContractArtifact, childAddress);
      const childSelector = await FunctionSelector.fromSignature('pub_set_value(Field)');
      const parentAddress = await AztecAddress.random();

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

      const parentAddress = await AztecAddress.random();
      await mockContractInstance(parentContractArtifact, parentAddress);

      // Only recurse once, so that we only enqueue 2 calls. #total-args should be low.
      const args = [/*remainingRecursions=*/ 1];
      await runSimulator({
        msgSender: parentAddress,
        contractAddress: parentAddress,
        anchorBlockHeader,
        artifact: ParentContractArtifact,
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

      const parentAddress = await AztecAddress.random();
      await mockContractInstance(parentContractArtifact, parentAddress);

      // 10 recursions (11 enqueued public calls) should overflow the total args limit
      // since each call enqueues a call with max / 10 args (plus 1 each time for function selector)
      const args = [/*remainingRecursions=*/ 10];
      await expect(
        runSimulator({
          msgSender: parentAddress,
          contractAddress: parentAddress,
          anchorBlockHeader,
          artifact: ParentContractArtifact,
          functionName: 'enqueue_call_to_child_with_many_args_and_recurse',
          args,
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
      // arbitrary random function that doesn't set a fee payer
      const contractAddress = await AztecAddress.random();
      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        anchorBlockHeader,
        functionName: 'get_this_address',
        contractAddress,
      });
      expect(result.publicInputs.isFeePayer).toBe(false);
    });

    it('should be able to set a fee payer', async () => {
      const contractAddress = await AztecAddress.random();
      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        anchorBlockHeader,
        functionName: 'test_setting_fee_payer',
        contractAddress,
      });
      expect(result.publicInputs.isFeePayer).toBe(true);
    });
  });

  describe('phase checking', () => {
    it('should be able to end setup checking phases', async () => {
      // arbitrary random function that doesn't set a fee payer
      const contractAddress = await AztecAddress.random();
      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        anchorBlockHeader,
        functionName: 'end_setup_checking_phases',
        contractAddress,
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
    beforeEach(async () => {
      await mockContractInstance(PendingNoteHashesContractArtifact, defaultContractAddress);
    });

    it('should be able to insert, read, and nullify pending note hashes in one call', async () => {
      noteStore.getNotes.mockResolvedValue([]);

      const amountToTransfer = 100n;

      const contractAddress = await AztecAddress.random();

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
        [derivedNoteHash, await computeAppNullifierSecretKey(ownerNskM, contractAddress)],
        GeneratorIndex.NOTE_NULLIFIER,
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
        [derivedNoteHash, await computeAppNullifierSecretKey(ownerNskM, contractAddress)],
        GeneratorIndex.NOTE_NULLIFIER,
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
      const pubKey = completeAddress.publicKeys.masterIncomingViewingPublicKey;

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
      const contractAddress = await AztecAddress.random();

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
