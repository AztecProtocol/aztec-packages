import {
  type AztecNode,
  CountedPublicExecutionRequest,
  HashedValues,
  type L1ToL2Message,
  type L2BlockNumber,
  Note,
  PublicExecutionRequest,
  TxExecutionRequest,
} from '@aztec/circuit-types';
import {
  AppendOnlyTreeSnapshot,
  BlockHeader,
  CallContext,
  CompleteAddress,
  type ContractInstance,
  GasFees,
  GasSettings,
  GeneratorIndex,
  type GrumpkinScalar,
  IndexedTaggingSecret,
  KeyValidationRequest,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
  PUBLIC_DISPATCH_SELECTOR,
  PartialStateReference,
  StateReference,
  TxContext,
  computeAppNullifierSecretKey,
  deriveKeys,
  getContractClassFromArtifact,
  getContractInstanceFromDeployParams,
  getNonEmptyItems,
} from '@aztec/circuits.js';
import {
  computeNoteHashNonce,
  computeSecretHash,
  computeVarArgsHash,
  deriveStorageSlotInMap,
  siloNullifier,
} from '@aztec/circuits.js/hash';
import { makeHeader } from '@aztec/circuits.js/testing';
import {
  type ContractArtifact,
  type FunctionArtifact,
  FunctionSelector,
  type NoteSelector,
  encodeArguments,
  getFunctionArtifact,
  getFunctionArtifactByName,
} from '@aztec/foundation/abi';
import { asyncMap } from '@aztec/foundation/async-map';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { times } from '@aztec/foundation/collection';
import { poseidon2Hash, poseidon2HashWithSeparator, randomInt } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type FieldsOf } from '@aztec/foundation/types';
import { openTmpStore } from '@aztec/kv-store/lmdb';
import { type AppendOnlyTree, Poseidon, StandardTree, newTree } from '@aztec/merkle-tree';
import { ChildContractArtifact } from '@aztec/noir-contracts.js/Child';
import { ImportTestContractArtifact } from '@aztec/noir-contracts.js/ImportTest';
import { ParentContractArtifact } from '@aztec/noir-contracts.js/Parent';
import { PendingNoteHashesContractArtifact } from '@aztec/noir-contracts.js/PendingNoteHashes';
import { StatefulTestContractArtifact } from '@aztec/noir-contracts.js/StatefulTest';
import { TestContractArtifact } from '@aztec/noir-contracts.js/Test';

import { jest } from '@jest/globals';
import { Matcher, type MatcherCreator, type MockProxy, mock } from 'jest-mock-extended';
import { toFunctionSelector } from 'viem';

import { MessageLoadOracleInputs } from '../common/message_load_oracle_inputs.js';
import { WASMSimulator } from '../providers/acvm_wasm.js';
import { buildL1ToL2Message } from '../test/utils.js';
import { type DBOracle } from './db_oracle.js';
import { AcirSimulator } from './simulator.js';

jest.setTimeout(60_000);

describe('Private Execution test suite', () => {
  const simulationProvider = new WASMSimulator();

  let oracle: MockProxy<DBOracle>;
  let node: MockProxy<AztecNode>;
  let acirSimulator: AcirSimulator;

  let header = BlockHeader.empty();
  let logger: Logger;

  let defaultContractAddress: AztecAddress;
  const ownerSk = Fr.fromHexString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');
  const recipientSk = Fr.fromHexString('0c9ed344548e8f9ba8aa3c9f8651eaa2853130f6c1e9c050ccf198f7ea18a7ec');
  let owner: AztecAddress;
  let recipient: AztecAddress;
  let ownerCompleteAddress: CompleteAddress;
  let recipientCompleteAddress: CompleteAddress;

  let ownerNskM: GrumpkinScalar;
  let recipientNskM: GrumpkinScalar;

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

    oracle.getContractInstance.calledWith(aztecAddressMatcher(address)).mockResolvedValue({
      currentContractClassId: contractClass.id,
      originalContractClassId: contractClass.id,
    } as ContractInstance);
  };

  const runSimulator = async ({
    artifact,
    functionName,
    args = [],
    msgSender = AztecAddress.fromField(Fr.MAX_FIELD_VALUE),
    contractAddress = undefined,
    txContext = {},
  }: {
    artifact: ContractArtifact;
    functionName: string;
    msgSender?: AztecAddress;
    contractAddress?: AztecAddress;
    args?: any[];
    txContext?: Partial<FieldsOf<TxContext>>;
  }) => {
    const functionArtifact = getFunctionArtifactByName(artifact, functionName);
    contractAddress = contractAddress ?? defaultContractAddress;
    const selector = await FunctionSelector.fromNameAndParameters(functionName, functionArtifact.parameters);
    await mockContractInstance(artifact, contractAddress);

    const hashedArguments = await HashedValues.fromValues(encodeArguments(functionArtifact, args));
    const txRequest = TxExecutionRequest.from({
      origin: contractAddress,
      firstCallArgsHash: hashedArguments.hash,
      functionSelector: selector,
      txContext: TxContext.from({ ...txContextFields, ...txContext }),
      argsOfCalls: [hashedArguments],
      authWitnesses: [],
      capsules: [],
    });

    return acirSimulator.run(txRequest, contractAddress, selector, msgSender);
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

    await tree.appendLeaves(leaves);

    // Create a new snapshot.
    const newSnap = new AppendOnlyTreeSnapshot(Fr.fromBuffer(tree.getRoot(true)), Number(tree.getNumLeaves(true)));

    if (name === 'noteHash' || name === 'l1ToL2Messages' || name === 'publicData') {
      header = new BlockHeader(
        header.lastArchive,
        header.contentCommitment,
        new StateReference(
          name === 'l1ToL2Messages' ? newSnap : header.state.l1ToL2MessageTree,
          new PartialStateReference(
            name === 'noteHash' ? newSnap : header.state.partial.noteHashTree,
            header.state.partial.nullifierTree,
            name === 'publicData' ? newSnap : header.state.partial.publicDataTree,
          ),
        ),
        header.globalVariables,
        header.totalFees,
        header.totalManaUsed,
      );
    } else {
      header = new BlockHeader(
        header.lastArchive,
        header.contentCommitment,
        new StateReference(newSnap, header.state.partial),
        header.globalVariables,
        header.totalFees,
        header.totalManaUsed,
      );
    }

    return trees[name];
  };

  beforeAll(async () => {
    logger = createLogger('simulator:test:private_execution');

    const ownerPartialAddress = Fr.random();
    ownerCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(ownerSk, ownerPartialAddress);
    ({ masterNullifierSecretKey: ownerNskM } = await deriveKeys(ownerSk));

    const recipientPartialAddress = Fr.random();
    recipientCompleteAddress = await CompleteAddress.fromSecretKeyAndPartialAddress(
      recipientSk,
      recipientPartialAddress,
    );
    ({ masterNullifierSecretKey: recipientNskM } = await deriveKeys(recipientSk));

    owner = ownerCompleteAddress.address;
    recipient = recipientCompleteAddress.address;
    defaultContractAddress = await AztecAddress.random();
  });

  beforeEach(async () => {
    trees = {};
    oracle = mock<DBOracle>();
    contracts = {};
    oracle.getKeyValidationRequest.mockImplementation(async (pkMHash: Fr, contractAddress: AztecAddress) => {
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
      throw new Error(`Unknown master public key hash: ${pkMHash}`);
    });

    // We call insertLeaves here with no leaves to populate empty public data tree root --> this is necessary to be
    // able to get ivpk_m during execution
    await insertLeaves([], 'publicData');
    oracle.getBlockHeader.mockResolvedValue(header);

    oracle.getCompleteAddress.mockImplementation((address: AztecAddress) => {
      if (address.equals(owner)) {
        return Promise.resolve(ownerCompleteAddress);
      }
      if (address.equals(recipient)) {
        return Promise.resolve(recipientCompleteAddress);
      }
      throw new Error(`Unknown address: ${address}. Recipient: ${recipient}, Owner: ${owner}`);
    });

    oracle.getIndexedTaggingSecretAsSender.mockImplementation(
      (_contractAddress: AztecAddress, _sender: AztecAddress, _recipient: AztecAddress) => {
        const secret = Fr.random();
        return Promise.resolve(new IndexedTaggingSecret(secret, 0));
      },
    );
    oracle.getFunctionArtifact.mockImplementation(async (address, selector) => {
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

    oracle.getFunctionArtifactByName.mockImplementation((address, name) => {
      const contract = contracts[address.toString()];
      if (!contract) {
        throw new Error(`Contract not found: ${address}`);
      }
      const artifact = getFunctionArtifactByName(contract, name);
      if (!artifact) {
        throw new Error(`Function not found: ${name} in contract ${address}`);
      }
      return Promise.resolve(artifact);
    });

    node = mock<AztecNode>();
    node.getPublicStorageAt.mockImplementation(
      (_address: AztecAddress, _storageSlot: Fr, _blockNumber: L2BlockNumber) => {
        return Promise.resolve(Fr.ZERO);
      },
    );

    acirSimulator = new AcirSimulator(oracle, node, simulationProvider);
  });

  describe('no constructor', () => {
    it('emits a field array as an encrypted log', async () => {
      // NB: this test does NOT cover correct enc/dec of values, just whether
      // the contexts correctly populate non-note encrypted logs
      const sender = recipient; // Needed for tagging.
      const args = [times(5, () => Fr.random()), owner, sender, false];
      const result = await runSimulator({
        artifact: TestContractArtifact,
        functionName: 'emit_array_as_encrypted_log',
        msgSender: owner,
        args,
      });

      const privateLogs = getNonEmptyItems(result.entrypoint.publicInputs.privateLogs);
      expect(privateLogs).toHaveLength(1);
    });
  });

  describe('stateful test contract', () => {
    const valueNoteTypeId = StatefulTestContractArtifact.notes['ValueNote'].id;

    let contractAddress: AztecAddress;
    const mockFirstNullifier = new Fr(1111);
    let currentNoteIndex = 0n;

    const buildNote = async (amount: bigint, ownerAddress: AztecAddress, storageSlot: Fr, noteTypeId: NoteSelector) => {
      // WARNING: this is not actually how nonces are computed!
      // For the purpose of this test we use a mocked firstNullifier and and a random number
      // to compute the nonce. Proper nonces are only enforced later by the kernel/later circuits
      // which are not relevant to this test. In practice, the kernel first squashes all transient
      // noteHashes with their matching nullifiers. It then reorders the remaining "persistable"
      // noteHashes. A TX's real first nullifier (generated by the initial kernel) and a noteHash's
      // array index at the output of the final kernel/ordering circuit are used to derive nonce via:
      // `hash(firstNullifier, noteHashIndex)`
      const noteHashIndex = randomInt(1); // mock index in TX's final noteHashes array
      const nonce = await computeNoteHashNonce(mockFirstNullifier, noteHashIndex);
      const note = new Note([new Fr(amount), ownerAddress.toField(), Fr.random()]);
      // Note: The following does not correspond to how note hashing is generally done in real notes.
      const noteHash = await poseidon2Hash([storageSlot, ...note.items]);
      return {
        contractAddress,
        storageSlot,
        noteTypeId,
        nonce,
        note,
        noteHash,
        siloedNullifier: new Fr(0),
        index: currentNoteIndex++,
      };
    };

    beforeEach(async () => {
      contractAddress = await AztecAddress.random();

      await mockContractInstance(StatefulTestContractArtifact, contractAddress);
    });

    it('should have a constructor with arguments that inserts notes', async () => {
      const initArgs = [owner, owner, 140];
      const instance = await getContractInstanceFromDeployParams(StatefulTestContractArtifact, {
        constructorArgs: initArgs,
      });
      oracle.getContractInstance.mockResolvedValue(instance);
      const executionResult = await runSimulator({
        args: initArgs,
        artifact: StatefulTestContractArtifact,
        functionName: 'constructor',
        contractAddress: instance.address,
      });
      const result = executionResult.entrypoint.nestedExecutions[0];

      expect(result.newNotes).toHaveLength(1);
      const newNote = result.newNotes[0];
      expect(newNote.storageSlot).toEqual(await deriveStorageSlotInMap(new Fr(1n), owner));
      expect(newNote.noteTypeId).toEqual(valueNoteTypeId); // ValueNote

      const noteHashes = getNonEmptyItems(result.publicInputs.noteHashes);
      expect(noteHashes).toHaveLength(1);
      expect(noteHashes[0].value).toEqual(
        await acirSimulator.computeNoteHash(contractAddress, newNote.storageSlot, newNote.noteTypeId, newNote.note),
      );

      const privateLogs = getNonEmptyItems(result.publicInputs.privateLogs);
      expect(privateLogs).toHaveLength(1);
    });

    it('should run the create_note function', async () => {
      const { entrypoint: result } = await runSimulator({
        args: [owner, owner, 140],
        artifact: StatefulTestContractArtifact,
        functionName: 'create_note_no_init_check',
      });

      expect(result.newNotes).toHaveLength(1);
      const newNote = result.newNotes[0];
      expect(newNote.storageSlot).toEqual(await deriveStorageSlotInMap(new Fr(1n), owner));
      expect(newNote.noteTypeId).toEqual(valueNoteTypeId); // ValueNote

      const noteHashes = getNonEmptyItems(result.publicInputs.noteHashes);
      expect(noteHashes).toHaveLength(1);
      expect(noteHashes[0].value).toEqual(
        await acirSimulator.computeNoteHash(contractAddress, newNote.storageSlot, newNote.noteTypeId, newNote.note),
      );

      const privateLogs = getNonEmptyItems(result.publicInputs.privateLogs);
      expect(privateLogs).toHaveLength(1);
    });

    it('should run the destroy_and_create function', async () => {
      const amountToTransfer = 100n;

      const storageSlot = await deriveStorageSlotInMap(StatefulTestContractArtifact.storageLayout['notes'].slot, owner);
      const recipientStorageSlot = await deriveStorageSlotInMap(
        StatefulTestContractArtifact.storageLayout['notes'].slot,
        recipient,
      );

      const notes = await Promise.all([
        buildNote(60n, ownerCompleteAddress.address, storageSlot, valueNoteTypeId),
        buildNote(80n, ownerCompleteAddress.address, storageSlot, valueNoteTypeId),
      ]);
      oracle.syncTaggedLogs.mockResolvedValue(new Map());
      oracle.processTaggedLogs.mockResolvedValue();
      oracle.getNotes.mockResolvedValue(notes);

      const consumedNotes = await asyncMap(notes, ({ nonce, note }) =>
        acirSimulator.computeNoteHashAndOptionallyANullifier(
          contractAddress,
          nonce,
          storageSlot,
          valueNoteTypeId,
          true,
          note,
        ),
      );
      await insertLeaves(consumedNotes.map(n => n.uniqueNoteHash));

      const args = [recipient, amountToTransfer];
      const { entrypoint: result, firstNullifier } = await runSimulator({
        args,
        artifact: StatefulTestContractArtifact,
        functionName: 'destroy_and_create_no_init_check',
        msgSender: owner,
        contractAddress,
      });

      // The two notes were nullified
      const nullifiers = getNonEmptyItems(result.publicInputs.nullifiers).map(n => n.value);
      expect(nullifiers).toHaveLength(consumedNotes.length);
      expect(nullifiers).toEqual(expect.arrayContaining(consumedNotes.map(n => n.innerNullifier)));
      // Uses one of the notes as first nullifier, not requiring a protocol injected nullifier.
      const consumedNotesNullifiers = await Promise.all(
        consumedNotes.map(n => siloNullifier(contractAddress, n.innerNullifier)),
      );
      expect(consumedNotesNullifiers).toContainEqual(firstNullifier);

      expect(result.newNotes).toHaveLength(2);
      const [changeNote, recipientNote] = result.newNotes;
      expect(recipientNote.storageSlot).toEqual(recipientStorageSlot);
      expect(recipientNote.noteTypeId).toEqual(valueNoteTypeId);

      const noteHashes = getNonEmptyItems(result.publicInputs.noteHashes);
      expect(noteHashes).toHaveLength(2);
      const [changeNoteHash, recipientNoteHash] = noteHashes;
      const [siloedChangeNoteHash, siloedRecipientNoteHash] = [
        await acirSimulator.computeNoteHash(contractAddress, storageSlot, valueNoteTypeId, changeNote.note),
        await acirSimulator.computeNoteHash(contractAddress, recipientStorageSlot, valueNoteTypeId, recipientNote.note),
      ];
      expect(changeNoteHash.value).toEqual(siloedChangeNoteHash);
      expect(recipientNoteHash.value).toEqual(siloedRecipientNoteHash);

      expect(recipientNote.note.items[0]).toEqual(new Fr(amountToTransfer));
      expect(changeNote.note.items[0]).toEqual(new Fr(40n));

      const privateLogs = getNonEmptyItems(result.publicInputs.privateLogs);
      expect(privateLogs).toHaveLength(2);

      const readRequests = getNonEmptyItems(result.publicInputs.noteHashReadRequests).map(r => r.value);
      expect(readRequests).toHaveLength(consumedNotes.length);
      expect(readRequests).toEqual(expect.arrayContaining(consumedNotes.map(n => n.uniqueNoteHash)));
    });

    it('should be able to destroy_and_create with dummy notes', async () => {
      const amountToTransfer = 100n;
      const balance = 160n;

      const storageSlot = await deriveStorageSlotInMap(new Fr(1n), owner);

      const notes = await Promise.all([buildNote(balance, ownerCompleteAddress.address, storageSlot, valueNoteTypeId)]);
      oracle.syncTaggedLogs.mockResolvedValue(new Map());
      oracle.processTaggedLogs.mockResolvedValue();
      oracle.getNotes.mockResolvedValue(notes);

      const consumedNotes = await asyncMap(notes, ({ nonce, note }) =>
        acirSimulator.computeNoteHashAndOptionallyANullifier(
          contractAddress,
          nonce,
          storageSlot,
          valueNoteTypeId,
          true,
          note,
        ),
      );
      await insertLeaves(consumedNotes.map(n => n.uniqueNoteHash));

      const args = [recipient, amountToTransfer];
      const { entrypoint: result } = await runSimulator({
        args,
        artifact: StatefulTestContractArtifact,
        functionName: 'destroy_and_create_no_init_check',
        msgSender: owner,
        contractAddress,
      });

      const nullifiers = getNonEmptyItems(result.publicInputs.nullifiers).map(n => n.value);
      expect(nullifiers).toEqual(consumedNotes.map(n => n.innerNullifier));

      expect(result.newNotes).toHaveLength(2);
      const [changeNote, recipientNote] = result.newNotes;
      expect(recipientNote.note.items[0]).toEqual(new Fr(amountToTransfer));
      expect(changeNote.note.items[0]).toEqual(new Fr(balance - amountToTransfer));

      const privateLogs = getNonEmptyItems(result.publicInputs.privateLogs);
      expect(privateLogs).toHaveLength(2);
    });
  });

  describe('nested calls', () => {
    const privateIncrement = txContextFields.chainId.value + txContextFields.version.value;

    it('child function should be callable', async () => {
      const initialValue = 100n;
      const { entrypoint: result } = await runSimulator({
        args: [initialValue],
        artifact: ChildContractArtifact,
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
        functionName: 'entry_point',
      });

      expect(result.returnValues).toEqual([new Fr(privateIncrement)]);

      // First fetch of the function artifact is the parent contract
      expect(oracle.getFunctionArtifact.mock.calls[1]).toEqual([childAddress, childSelector]);
      expect(result.nestedExecutions).toHaveLength(1);
      expect(result.nestedExecutions[0].returnValues).toEqual([new Fr(privateIncrement)]);
      expect(result.publicInputs.privateCallRequests[0].callContext).toEqual(
        result.nestedExecutions[0].publicInputs.callContext,
      );
    });
  });

  describe('nested calls through autogenerated interface', () => {
    let args: any[];
    let argsHash: Fr;
    let testCodeGenArtifact: FunctionArtifact;

    beforeAll(async () => {
      // These args should match the ones hardcoded in importer contract
      // eslint-disable-next-line camelcase
      const dummyNote = { amount: 1, secret_hash: 2 };
      // eslint-disable-next-line camelcase
      const deepStruct = { a_field: 1, a_bool: true, a_note: dummyNote, many_notes: [dummyNote, dummyNote, dummyNote] };
      args = [1, true, 1, [1, 2], dummyNote, deepStruct];
      testCodeGenArtifact = getFunctionArtifactByName(TestContractArtifact, 'test_code_gen');
      const serializedArgs = encodeArguments(testCodeGenArtifact, args);
      argsHash = await computeVarArgsHash(serializedArgs);
    });

    it('test function should be directly callable', async () => {
      logger.info(`Calling testCodeGen function`);
      const { entrypoint: result } = await runSimulator({
        args,
        artifact: TestContractArtifact,
        functionName: 'test_code_gen',
      });

      expect(result.returnValues).toEqual([argsHash]);
    });

    it('test function should be callable through autogenerated interface', async () => {
      const testAddress = await AztecAddress.random();
      const testCodeGenSelector = await FunctionSelector.fromNameAndParameters(
        testCodeGenArtifact.name,
        testCodeGenArtifact.parameters,
      );

      await mockContractInstance(TestContractArtifact, testAddress);

      logger.info(`Calling importer main function`);
      const args = [testAddress];
      const { entrypoint: result } = await runSimulator({
        args,
        artifact: ImportTestContractArtifact,
        functionName: 'main_contract',
      });

      expect(result.returnValues).toEqual([argsHash]);
      expect(oracle.getFunctionArtifact.mock.calls[1]).toEqual([testAddress, testCodeGenSelector]);
      expect(result.nestedExecutions).toHaveLength(1);
      expect(result.nestedExecutions[0].returnValues).toEqual([argsHash]);
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

      const mockOracles = async (updateHeader = true) => {
        const tree = await insertLeaves([preimage.hash()], 'l1ToL2Messages');
        oracle.getL1ToL2MembershipWitness.mockImplementation(async () => {
          return Promise.resolve(new MessageLoadOracleInputs(0n, await tree.getSiblingPath(0n, true)));
        });
        if (updateHeader) {
          oracle.getBlockHeader.mockResolvedValue(header);
        }
      };

      it('Should be able to consume a dummy cross chain message', async () => {
        preimage = await computePreimage();
        args = computeArgs();
        await mockOracles();

        const result = await runSimulator({
          contractAddress,
          artifact: TestContractArtifact,
          functionName: 'consume_mint_to_private_message',
          args,
          txContext: { version: new Fr(1n), chainId: new Fr(1n) },
        });

        // Check a nullifier has been inserted
        const nullifiers = getNonEmptyItems(result.entrypoint.publicInputs.nullifiers);
        expect(nullifiers).toHaveLength(1);
      });

      it('Invalid membership proof', async () => {
        preimage = await computePreimage();

        args = computeArgs();

        // Don't update the header so the message is not in state
        await mockOracles(false);

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
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
        // Update state
        oracle.getBlockHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
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
        // Update state
        oracle.getBlockHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
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
        // Update state
        oracle.getBlockHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
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
        // Update state
        oracle.getBlockHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
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
        // Update state
        oracle.getBlockHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
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
        // Update state
        oracle.getBlockHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact: TestContractArtifact,
            functionName: 'consume_mint_to_private_message',
            args,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrow('Message not in state');
      });
    });

    it('Should be able to consume a dummy public to private message', async () => {
      const secret = new Fr(1n);
      const secretHash = await computeSecretHash(secret);
      const note = new Note([secretHash]);
      const storageSlot = TestContractArtifact.storageLayout['example_set'].slot;
      oracle.syncTaggedLogs.mockResolvedValue(new Map());
      oracle.processTaggedLogs.mockResolvedValue();
      oracle.getNotes.mockResolvedValue([
        {
          contractAddress,
          storageSlot,
          nonce: Fr.ZERO,
          note,
          noteHash: Fr.ZERO,
          siloedNullifier: Fr.random(),
          index: 1n,
        },
      ]);

      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        functionName: 'consume_note_from_secret',
        args: [secret],
        contractAddress,
      });

      // Check a nullifier has been inserted.
      const nullifiers = getNonEmptyItems(result.publicInputs.nullifiers);
      expect(nullifiers).toHaveLength(1);

      // Check the commitment read request was created successfully.
      const readRequests = getNonEmptyItems(result.publicInputs.noteHashReadRequests);
      expect(readRequests).toHaveLength(1);
    });
  });

  describe('enqueued calls', () => {
    it.each([false, true])('parent should enqueue call to child (internal %p)', async isInternal => {
      const childContractArtifact = structuredClone(ChildContractArtifact);
      const childFunctionArtifact = childContractArtifact.functions.find(fn => fn.name === 'public_dispatch')!;
      expect(childFunctionArtifact).toBeDefined();
      childFunctionArtifact.isInternal = isInternal;

      const childAddress = await AztecAddress.random();
      await mockContractInstance(childContractArtifact, childAddress);
      const childSelector = await FunctionSelector.fromSignature('pub_set_value(Field)');
      const parentAddress = await AztecAddress.random();

      const args = [childAddress, childSelector, 42n];
      const result = await runSimulator({
        msgSender: parentAddress,
        contractAddress: parentAddress,
        artifact: ParentContractArtifact,
        functionName: 'enqueue_call_to_child',
        args,
      });

      const request = new CountedPublicExecutionRequest(
        PublicExecutionRequest.from({
          args: [childSelector.toField(), new Fr(42n)],
          callContext: CallContext.from({
            msgSender: parentAddress,
            contractAddress: childAddress,
            functionSelector: FunctionSelector.fromField(new Fr(PUBLIC_DISPATCH_SELECTOR)),
            isStaticCall: false,
          }),
        }),
        2, // sideEffectCounter
      );

      expect(result.entrypoint.enqueuedPublicFunctionCalls).toEqual([request]);
    });
  });

  describe('setting teardown function', () => {
    it('should be able to set a teardown function', async () => {
      // All public functions get wrapped in a public_dispatch function
      const publicDispatch = getFunctionArtifactByName(TestContractArtifact, 'public_dispatch');
      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        functionName: 'test_setting_teardown',
      });
      expect(result.publicTeardownFunctionCall.isEmpty()).toBeFalsy();
      expect(result.publicTeardownFunctionCall.callContext.functionSelector).toEqual(
        await FunctionSelector.fromNameAndParameters(publicDispatch.name, publicDispatch.parameters),
      );
      expect(result.publicTeardownFunctionCall.args[0]).toEqual(
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
        functionName: 'get_this_address',
        contractAddress,
      });
      expect(result.publicInputs.isFeePayer).toBe(false);
    });

    it('should be able to set a fee payer', async () => {
      const contractAddress = await AztecAddress.random();
      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        functionName: 'test_setting_fee_payer',
        contractAddress,
      });
      expect(result.publicInputs.isFeePayer).toBe(true);
    });
  });

  describe('pending note hashes contract', () => {
    const valueNoteTypeId = PendingNoteHashesContractArtifact.notes['ValueNote'].id;

    beforeEach(async () => {
      await mockContractInstance(PendingNoteHashesContractArtifact, defaultContractAddress);
    });

    it('should be able to insert, read, and nullify pending note hashes in one call', async () => {
      oracle.syncTaggedLogs.mockResolvedValue(new Map());
      oracle.processTaggedLogs.mockResolvedValue();
      oracle.getNotes.mockResolvedValue([]);

      const amountToTransfer = 100n;

      const contractAddress = await AztecAddress.random();

      const sender = owner;
      const args = [amountToTransfer, owner, sender];
      const { entrypoint: result } = await runSimulator({
        args: args,
        artifact: PendingNoteHashesContractArtifact,
        functionName: 'test_insert_then_get_then_nullify_flat',
        contractAddress,
      });

      expect(result.newNotes).toHaveLength(1);
      const noteAndSlot = result.newNotes[0];
      expect(noteAndSlot.storageSlot).toEqual(await deriveStorageSlotInMap(new Fr(1n), owner));

      expect(noteAndSlot.note.items[0]).toEqual(new Fr(amountToTransfer));

      const noteHashesFromCall = getNonEmptyItems(result.publicInputs.noteHashes);
      expect(noteHashesFromCall).toHaveLength(1);

      const noteHashFromCall = noteHashesFromCall[0].value;
      const storageSlot = await deriveStorageSlotInMap(
        PendingNoteHashesContractArtifact.storageLayout['balances'].slot,
        owner,
      );

      const derivedNoteHash = await acirSimulator.computeNoteHash(
        contractAddress,
        storageSlot,
        valueNoteTypeId,
        noteAndSlot.note,
      );
      expect(noteHashFromCall).toEqual(derivedNoteHash);

      const privateLogs = getNonEmptyItems(result.publicInputs.privateLogs);
      expect(privateLogs).toHaveLength(1);

      // read request should match a note hash for pending notes (there is no nonce, so can't compute "unique" hash)
      const readRequest = getNonEmptyItems(result.publicInputs.noteHashReadRequests)[0];
      expect(readRequest.value).toEqual(derivedNoteHash);

      expect(result.returnValues).toEqual([new Fr(amountToTransfer)]);

      const nullifier = result.publicInputs.nullifiers[0];
      const expectedNullifier = await poseidon2HashWithSeparator(
        [derivedNoteHash, await computeAppNullifierSecretKey(ownerNskM, contractAddress)],
        GeneratorIndex.NOTE_NULLIFIER,
      );
      expect(nullifier.value).toEqual(expectedNullifier);
    });

    it('should be able to insert, read, and nullify pending note hashes in nested calls', async () => {
      oracle.syncTaggedLogs.mockResolvedValue(new Map());
      oracle.processTaggedLogs.mockResolvedValue();
      oracle.getNotes.mockResolvedValue([]);

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
      });

      const execInsert = result.nestedExecutions[0];
      const execGetThenNullify = result.nestedExecutions[1];

      const storageSlot = await deriveStorageSlotInMap(
        PendingNoteHashesContractArtifact.storageLayout['balances'].slot,
        owner,
      );

      expect(execInsert.newNotes).toHaveLength(1);
      const noteAndSlot = execInsert.newNotes[0];
      expect(noteAndSlot.storageSlot).toEqual(storageSlot);
      expect(noteAndSlot.noteTypeId).toEqual(valueNoteTypeId);

      expect(noteAndSlot.note.items[0]).toEqual(new Fr(amountToTransfer));

      const noteHashes = getNonEmptyItems(execInsert.publicInputs.noteHashes);
      expect(noteHashes).toHaveLength(1);

      const derivedNoteHash = await acirSimulator.computeNoteHash(
        contractAddress,
        noteAndSlot.storageSlot,
        noteAndSlot.noteTypeId,
        noteAndSlot.note,
      );
      expect(noteHashes[0].value).toEqual(derivedNoteHash);

      const privateLogs = getNonEmptyItems(execInsert.publicInputs.privateLogs);
      expect(privateLogs).toHaveLength(1);

      // read request should match a note hash for pending notes (there is no nonce, so can't compute "unique" hash)
      const readRequest = execGetThenNullify.publicInputs.noteHashReadRequests[0];
      expect(readRequest.value).toEqual(derivedNoteHash);

      expect(execGetThenNullify.returnValues).toEqual([new Fr(amountToTransfer)]);

      const nullifier = execGetThenNullify.publicInputs.nullifiers[0];
      const expectedNullifier = await poseidon2HashWithSeparator(
        [derivedNoteHash, await computeAppNullifierSecretKey(ownerNskM, contractAddress)],
        GeneratorIndex.NOTE_NULLIFIER,
      );
      expect(nullifier.value).toEqual(expectedNullifier);
    });

    it('cant read a commitment that is inserted later in same call', async () => {
      oracle.syncTaggedLogs.mockResolvedValue(new Map());
      oracle.processTaggedLogs.mockResolvedValue();
      oracle.getNotes.mockResolvedValue([]);

      const amountToTransfer = 100n;

      const contractAddress = await AztecAddress.random();

      const args = [amountToTransfer, owner];
      // This will throw if we read the note before it was inserted
      await runSimulator({
        args: args,
        artifact: PendingNoteHashesContractArtifact,
        functionName: 'test_bad_get_then_insert_flat',
        contractAddress,
      });
    });
  });

  describe('get master incoming viewing public key', () => {
    it('gets the public key for an address', async () => {
      // Generate a partial address, pubkey, and resulting address
      const completeAddress = await CompleteAddress.random();
      const args = [completeAddress.address];
      const pubKey = completeAddress.publicKeys.masterIncomingViewingPublicKey;

      oracle.getCompleteAddress.mockResolvedValue(completeAddress);
      const { entrypoint: result } = await runSimulator({
        artifact: TestContractArtifact,
        functionName: 'get_master_incoming_viewing_public_key',
        args,
      });
      expect(result.returnValues).toEqual([pubKey.x, pubKey.y]);
    });
  });

  describe('Get notes', () => {
    it('fails if returning no notes', async () => {
      const args = [2n, true];
      oracle.syncTaggedLogs.mockResolvedValue(new Map());
      oracle.processTaggedLogs.mockResolvedValue();
      oracle.getNotes.mockResolvedValue([]);

      await expect(() =>
        runSimulator({ artifact: TestContractArtifact, functionName: 'call_get_notes', args }),
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
        }),
      ).rejects.toThrow('Invalid version');
    });
  });

  describe('Historical header in private context', () => {
    beforeEach(() => {
      header = makeHeader();

      oracle.getBlockHeader.mockClear();
      oracle.getBlockHeader.mockResolvedValue(header);
    });

    it('Header is correctly set', async () => {
      const args = [await header.hash()];

      await runSimulator({
        artifact: TestContractArtifact,
        functionName: 'assert_header_private',
        msgSender: owner,
        args,
      });
    });

    it('Throws when header is not as expected', async () => {
      const unexpectedHeaderHash = Fr.random();
      const args = [unexpectedHeaderHash];

      await expect(() =>
        runSimulator({ artifact: TestContractArtifact, functionName: 'assert_header_private', msgSender: owner, args }),
      ).rejects.toThrow('Invalid header hash');
    });
  });
});
