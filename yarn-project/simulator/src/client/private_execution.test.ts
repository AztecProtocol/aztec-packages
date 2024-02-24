import { AztecNode, L1ToL2Message, Note, PackedArguments, TxExecutionRequest } from '@aztec/circuit-types';
import {
  AppendOnlyTreeSnapshot,
  CallContext,
  CompleteAddress,
  ContractDeploymentData,
  FunctionData,
  Header,
  L1_TO_L2_MSG_TREE_HEIGHT,
  MAX_NEW_NOTE_HASHES_PER_CALL,
  NOTE_HASH_TREE_HEIGHT,
  PartialStateReference,
  PublicCallRequest,
  StateReference,
  TxContext,
  computeNullifierSecretKey,
  computeSiloedNullifierSecretKey,
  derivePublicKey,
  nonEmptySideEffects,
  sideEffectArrayToValueArray,
} from '@aztec/circuits.js';
import { makeContractDeploymentData, makeHeader } from '@aztec/circuits.js/factories';
import {
  computeCommitmentNonce,
  computeMessageSecretHash,
  computeVarArgsHash,
  siloNoteHash,
} from '@aztec/circuits.js/hash';
import {
  FunctionArtifact,
  FunctionSelector,
  encodeArguments,
  getFunctionArtifact,
  getFunctionArtifactWithSelector,
} from '@aztec/foundation/abi';
import { asyncMap } from '@aztec/foundation/async-map';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { times } from '@aztec/foundation/collection';
import { pedersenHash } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import { DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { FieldsOf } from '@aztec/foundation/types';
import { openTmpStore } from '@aztec/kv-store/utils';
import { AppendOnlyTree, Pedersen, StandardTree, newTree } from '@aztec/merkle-tree';
import {
  ChildContractArtifact,
  ImportTestContractArtifact,
  ParentContractArtifact,
  PendingCommitmentsContractArtifact,
  StatefulTestContractArtifact,
  TestContractArtifact,
  TokenContractArtifact,
} from '@aztec/noir-contracts.js';

import { jest } from '@jest/globals';
import { MockProxy, mock } from 'jest-mock-extended';
import { getFunctionSelector } from 'viem';

import { KeyPair, MessageLoadOracleInputs } from '../acvm/index.js';
import { buildL1ToL2Message } from '../test/utils.js';
import { computeSlotForMapping } from '../utils.js';
import { DBOracle } from './db_oracle.js';
import { collectUnencryptedLogs } from './execution_result.js';
import { AcirSimulator } from './simulator.js';

jest.setTimeout(60_000);

describe('Private Execution test suite', () => {
  let oracle: MockProxy<DBOracle>;
  let node: MockProxy<AztecNode>;

  let acirSimulator: AcirSimulator;

  let header = Header.empty();
  let logger: DebugLogger;

  const defaultContractAddress = AztecAddress.random();
  const ownerPk = GrumpkinScalar.fromString('2dcc5485a58316776299be08c78fa3788a1a7961ae30dc747fb1be17692a8d32');
  const recipientPk = GrumpkinScalar.fromString('0c9ed344548e8f9ba8aa3c9f8651eaa2853130f6c1e9c050ccf198f7ea18a7ec');
  let owner: AztecAddress;
  let recipient: AztecAddress;
  let ownerCompleteAddress: CompleteAddress;
  let recipientCompleteAddress: CompleteAddress;
  let ownerNullifierKeyPair: KeyPair;
  let recipientNullifierKeyPair: KeyPair;

  const treeHeights: { [name: string]: number } = {
    noteHash: NOTE_HASH_TREE_HEIGHT,
    l1ToL2Messages: L1_TO_L2_MSG_TREE_HEIGHT,
  };

  let trees: { [name: keyof typeof treeHeights]: AppendOnlyTree } = {};
  const txContextFields: FieldsOf<TxContext> = {
    isContractDeploymentTx: false,
    isFeePaymentTx: false,
    isRebatePaymentTx: false,
    chainId: new Fr(10),
    version: new Fr(20),
    contractDeploymentData: ContractDeploymentData.empty(),
  };

  const runSimulator = ({
    artifact,
    args = [],
    msgSender = AztecAddress.ZERO,
    contractAddress = defaultContractAddress,
    portalContractAddress = EthAddress.ZERO,
    txContext = {},
  }: {
    artifact: FunctionArtifact;
    msgSender?: AztecAddress;
    contractAddress?: AztecAddress;
    portalContractAddress?: EthAddress;
    args?: any[];
    txContext?: Partial<FieldsOf<TxContext>>;
  }) => {
    const packedArguments = PackedArguments.fromArgs(encodeArguments(artifact, args));
    const functionData = FunctionData.fromAbi(artifact);
    const txRequest = TxExecutionRequest.from({
      origin: contractAddress,
      argsHash: packedArguments.hash,
      functionData,
      txContext: TxContext.from({ ...txContextFields, ...txContext }),
      packedArguments: [packedArguments],
      authWitnesses: [],
    });

    return acirSimulator.run(
      txRequest,
      artifact,
      functionData.isConstructor ? AztecAddress.ZERO : contractAddress,
      portalContractAddress,
      msgSender,
    );
  };

  const insertLeaves = async (leaves: Fr[], name = 'noteHash') => {
    if (!treeHeights[name]) {
      throw new Error(`Unknown tree ${name}`);
    }
    if (!trees[name]) {
      const db = openTmpStore();
      const pedersen = new Pedersen();
      trees[name] = await newTree(StandardTree, db, pedersen, name, treeHeights[name]);
    }
    const tree = trees[name];

    await tree.appendLeaves(leaves.map(l => l.toBuffer()));

    // Create a new snapshot.
    const newSnap = new AppendOnlyTreeSnapshot(Fr.fromBuffer(tree.getRoot(true)), Number(tree.getNumLeaves(true)));

    if (name === 'noteHash') {
      header = new Header(
        header.lastArchive,
        header.contentCommitment,
        new StateReference(
          header.state.l1ToL2MessageTree,
          new PartialStateReference(
            newSnap,
            header.state.partial.nullifierTree,
            header.state.partial.contractTree,
            header.state.partial.publicDataTree,
          ),
        ),
        header.globalVariables,
      );
    } else {
      header = new Header(
        header.lastArchive,
        header.contentCommitment,
        new StateReference(newSnap, header.state.partial),
        header.globalVariables,
      );
    }

    return trees[name];
  };

  const hashFields = (data: Fr[]) => pedersenHash(data.map(f => f.toBuffer()));

  beforeAll(() => {
    logger = createDebugLogger('aztec:test:private_execution');

    ownerCompleteAddress = CompleteAddress.fromPrivateKeyAndPartialAddress(ownerPk, Fr.random());
    recipientCompleteAddress = CompleteAddress.fromPrivateKeyAndPartialAddress(recipientPk, Fr.random());

    owner = ownerCompleteAddress.address;
    recipient = recipientCompleteAddress.address;

    const ownerNullifierSecretKey = computeNullifierSecretKey(ownerPk);
    ownerNullifierKeyPair = {
      secretKey: ownerNullifierSecretKey,
      publicKey: derivePublicKey(ownerNullifierSecretKey),
    };

    const recipientNullifierSecretKey = computeNullifierSecretKey(recipientPk);
    recipientNullifierKeyPair = {
      secretKey: recipientNullifierSecretKey,
      publicKey: derivePublicKey(recipientNullifierSecretKey),
    };
  });

  beforeEach(() => {
    trees = {};
    oracle = mock<DBOracle>();
    oracle.getNullifierKeyPair.mockImplementation((accountAddress: AztecAddress, contractAddress: AztecAddress) => {
      if (accountAddress.equals(ownerCompleteAddress.address)) {
        return Promise.resolve({
          publicKey: ownerNullifierKeyPair.publicKey,
          secretKey: computeSiloedNullifierSecretKey(ownerNullifierKeyPair.secretKey, contractAddress),
        });
      }
      if (accountAddress.equals(recipientCompleteAddress.address)) {
        return Promise.resolve({
          publicKey: recipientNullifierKeyPair.publicKey,
          secretKey: computeSiloedNullifierSecretKey(recipientNullifierKeyPair.secretKey, contractAddress),
        });
      }
      throw new Error(`Unknown address ${accountAddress}`);
    });
    oracle.getHeader.mockResolvedValue(header);

    acirSimulator = new AcirSimulator(oracle, node);
  });

  describe('empty constructor', () => {
    it('should run the empty constructor', async () => {
      const artifact = getFunctionArtifact(TestContractArtifact, 'constructor');
      const contractDeploymentData = makeContractDeploymentData(100);
      const txContext = { isContractDeploymentTx: true, contractDeploymentData };
      const result = await runSimulator({ artifact, txContext });

      const emptyCommitments = new Array(MAX_NEW_NOTE_HASHES_PER_CALL).fill(Fr.ZERO);
      expect(sideEffectArrayToValueArray(result.callStackItem.publicInputs.newNoteHashes)).toEqual(emptyCommitments);
      expect(result.callStackItem.publicInputs.contractDeploymentData).toEqual(contractDeploymentData);
    });

    it('emits a field as an unencrypted log', async () => {
      const artifact = getFunctionArtifact(TestContractArtifact, 'emit_msg_sender');
      const result = await runSimulator({ artifact, msgSender: owner });
      const [functionLogs] = collectUnencryptedLogs(result);
      expect(functionLogs.logs).toHaveLength(1);
      // Test that the log payload (ie ignoring address, selector, and header) matches what we emitted
      expect(functionLogs.logs[0].subarray(-32).toString('hex')).toEqual(owner.toBuffer().toString('hex'));
    });

    it('emits a field array as an unencrypted log', async () => {
      const artifact = getFunctionArtifact(TestContractArtifact, 'emit_array_as_unencrypted_log');
      const args = [times(5, () => Fr.random())];
      const result = await runSimulator({ artifact, msgSender: owner, args });
      const [functionLogs] = collectUnencryptedLogs(result);
      expect(functionLogs.logs).toHaveLength(1);
      // Test that the log payload (ie ignoring address, selector, and header) matches what we emitted
      const expected = Buffer.concat(args[0].map(arg => arg.toBuffer())).toString('hex');
      expect(functionLogs.logs[0].subarray(-32 * 5).toString('hex')).toEqual(expected);
    });
  });

  describe('stateful test contract', () => {
    const contractAddress = defaultContractAddress;
    const mockFirstNullifier = new Fr(1111);
    let currentNoteIndex = 0n;

    const buildNote = (amount: bigint, owner: AztecAddress, storageSlot: Fr, noteTypeId: Fr) => {
      // WARNING: this is not actually how nonces are computed!
      // For the purpose of this test we use a mocked firstNullifier and and a random number
      // to compute the nonce. Proper nonces are only enforced later by the kernel/later circuits
      // which are not relevant to this test. In practice, the kernel first squashes all transient
      // noteHashes with their matching nullifiers. It then reorders the remaining "persistable"
      // noteHashes. A TX's real first nullifier (generated by the initial kernel) and a noteHash's
      // array index at the output of the final kernel/ordering circuit are used to derive nonce via:
      // `hash(firstNullifier, noteHashIndex)`
      const noteHashIndex = Math.floor(Math.random()); // mock index in TX's final newNoteHashes array
      const nonce = computeCommitmentNonce(mockFirstNullifier, noteHashIndex);
      const note = new Note([new Fr(amount), owner.toField(), Fr.random()]);
      const innerNoteHash = hashFields(note.items);
      return {
        contractAddress,
        storageSlot,
        noteTypeId,
        nonce,
        note,
        innerNoteHash,
        siloedNullifier: new Fr(0),
        index: currentNoteIndex++,
      };
    };

    beforeEach(() => {
      oracle.getCompleteAddress.mockImplementation((address: AztecAddress) => {
        if (address.equals(owner)) {
          return Promise.resolve(ownerCompleteAddress);
        }
        if (address.equals(recipient)) {
          return Promise.resolve(recipientCompleteAddress);
        }
        throw new Error(`Unknown address ${address}`);
      });

      oracle.getFunctionArtifactByName.mockImplementation((_, functionName: string) =>
        Promise.resolve(getFunctionArtifact(StatefulTestContractArtifact, functionName)),
      );

      oracle.getFunctionArtifact.mockImplementation((_, selector: FunctionSelector) =>
        Promise.resolve(getFunctionArtifact(StatefulTestContractArtifact, selector)),
      );

      oracle.getPortalContractAddress.mockResolvedValue(EthAddress.ZERO);
    });

    it('should have a constructor with arguments that inserts notes', async () => {
      const artifact = getFunctionArtifact(StatefulTestContractArtifact, 'constructor');
      const topLevelResult = await runSimulator({ args: [owner, 140], artifact });
      const result = topLevelResult.nestedExecutions[0];

      expect(result.newNotes).toHaveLength(1);
      const newNote = result.newNotes[0];
      expect(newNote.storageSlot).toEqual(computeSlotForMapping(new Fr(1n), owner));
      expect(newNote.noteTypeId).toEqual(new Fr(869710811710178111116101n)); // ValueNote

      const newNoteHashes = sideEffectArrayToValueArray(
        nonEmptySideEffects(result.callStackItem.publicInputs.newNoteHashes),
      );
      expect(newNoteHashes).toHaveLength(1);

      const [commitment] = newNoteHashes;
      expect(commitment).toEqual(
        await acirSimulator.computeInnerNoteHash(
          contractAddress,
          newNote.storageSlot,
          newNote.noteTypeId,
          newNote.note,
        ),
      );
    });

    it('should run the create_note function', async () => {
      const artifact = getFunctionArtifact(StatefulTestContractArtifact, 'create_note');

      const result = await runSimulator({ args: [owner, 140], artifact });

      expect(result.newNotes).toHaveLength(1);
      const newNote = result.newNotes[0];
      expect(newNote.storageSlot).toEqual(computeSlotForMapping(new Fr(1n), owner));
      expect(newNote.noteTypeId).toEqual(new Fr(869710811710178111116101n)); // ValueNote

      const newNoteHashes = sideEffectArrayToValueArray(
        nonEmptySideEffects(result.callStackItem.publicInputs.newNoteHashes),
      );
      expect(newNoteHashes).toHaveLength(1);

      const [commitment] = newNoteHashes;
      expect(commitment).toEqual(
        await acirSimulator.computeInnerNoteHash(
          contractAddress,
          newNote.storageSlot,
          newNote.noteTypeId,
          newNote.note,
        ),
      );
    });

    it('should run the destroy_and_create function', async () => {
      const amountToTransfer = 100n;
      const artifact = getFunctionArtifact(StatefulTestContractArtifact, 'destroy_and_create');

      const storageSlot = computeSlotForMapping(new Fr(1n), owner);
      const recipientStorageSlot = computeSlotForMapping(new Fr(1n), recipient);

      const noteTypeId = new Fr(869710811710178111116101n); // ValueNote

      const notes = [buildNote(60n, owner, storageSlot, noteTypeId), buildNote(80n, owner, storageSlot, noteTypeId)];
      oracle.getNotes.mockResolvedValue(notes);

      const consumedNotes = await asyncMap(notes, ({ nonce, note }) =>
        acirSimulator.computeNoteHashAndNullifier(contractAddress, nonce, storageSlot, noteTypeId, note),
      );
      await insertLeaves(consumedNotes.map(n => n.siloedNoteHash));

      const args = [recipient, amountToTransfer];
      const result = await runSimulator({ args, artifact, msgSender: owner });

      // The two notes were nullified
      const newNullifiers = sideEffectArrayToValueArray(
        nonEmptySideEffects(result.callStackItem.publicInputs.newNullifiers),
      );
      expect(newNullifiers).toHaveLength(consumedNotes.length);
      expect(newNullifiers).toEqual(expect.arrayContaining(consumedNotes.map(n => n.innerNullifier)));

      expect(result.newNotes).toHaveLength(2);
      const [changeNote, recipientNote] = result.newNotes;
      expect(recipientNote.storageSlot).toEqual(recipientStorageSlot);
      expect(recipientNote.noteTypeId).toEqual(noteTypeId);

      const newNoteHashes = sideEffectArrayToValueArray(result.callStackItem.publicInputs.newNoteHashes).filter(
        field => !field.equals(Fr.ZERO),
      );
      expect(newNoteHashes).toHaveLength(2);

      const [changeNoteCommitment, recipientNoteCommitment] = newNoteHashes;
      expect(recipientNoteCommitment).toEqual(
        await acirSimulator.computeInnerNoteHash(contractAddress, recipientStorageSlot, noteTypeId, recipientNote.note),
      );
      expect(changeNoteCommitment).toEqual(
        await acirSimulator.computeInnerNoteHash(contractAddress, storageSlot, noteTypeId, changeNote.note),
      );

      expect(recipientNote.note.items[0]).toEqual(new Fr(amountToTransfer));
      expect(changeNote.note.items[0]).toEqual(new Fr(40n));

      const readRequests = sideEffectArrayToValueArray(
        nonEmptySideEffects(result.callStackItem.publicInputs.readRequests),
      );

      expect(readRequests).toHaveLength(consumedNotes.length);
      expect(readRequests).toEqual(expect.arrayContaining(consumedNotes.map(n => n.uniqueSiloedNoteHash)));
    });

    it('should be able to destroy_and_create with dummy notes', async () => {
      const amountToTransfer = 100n;
      const balance = 160n;
      const artifact = getFunctionArtifact(StatefulTestContractArtifact, 'destroy_and_create');

      const storageSlot = computeSlotForMapping(new Fr(1n), owner);
      const noteTypeId = new Fr(869710811710178111116101n); // ValueNote

      const notes = [buildNote(balance, owner, storageSlot, noteTypeId)];
      oracle.getNotes.mockResolvedValue(notes);

      const consumedNotes = await asyncMap(notes, ({ nonce, note }) =>
        acirSimulator.computeNoteHashAndNullifier(contractAddress, nonce, storageSlot, noteTypeId, note),
      );
      await insertLeaves(consumedNotes.map(n => n.siloedNoteHash));

      const args = [recipient, amountToTransfer];
      const result = await runSimulator({ args, artifact, msgSender: owner });

      const newNullifiers = sideEffectArrayToValueArray(
        nonEmptySideEffects(result.callStackItem.publicInputs.newNullifiers),
      );
      expect(newNullifiers).toEqual(consumedNotes.map(n => n.innerNullifier));

      expect(result.newNotes).toHaveLength(2);
      const [changeNote, recipientNote] = result.newNotes;
      expect(recipientNote.note.items[0]).toEqual(new Fr(amountToTransfer));
      expect(changeNote.note.items[0]).toEqual(new Fr(balance - amountToTransfer));
    });
  });

  describe('nested calls', () => {
    const privateIncrement = txContextFields.chainId.value + txContextFields.version.value;

    it('child function should be callable', async () => {
      const initialValue = 100n;
      const artifact = getFunctionArtifact(ChildContractArtifact, 'value');
      const result = await runSimulator({ args: [initialValue], artifact });

      expect(result.callStackItem.publicInputs.returnValues[0]).toEqual(new Fr(initialValue + privateIncrement));
    });

    it('parent should call child', async () => {
      const childArtifact = getFunctionArtifact(ChildContractArtifact, 'value');
      const parentArtifact = getFunctionArtifact(ParentContractArtifact, 'entryPoint');
      const parentAddress = AztecAddress.random();
      const childAddress = AztecAddress.random();
      const childSelector = FunctionSelector.fromNameAndParameters(childArtifact.name, childArtifact.parameters);

      oracle.getFunctionArtifact.mockImplementation(() => Promise.resolve(childArtifact));
      oracle.getPortalContractAddress.mockImplementation(() => Promise.resolve(EthAddress.ZERO));

      logger(`Parent deployed at ${parentAddress.toShortString()}`);
      logger(`Calling child function ${childSelector.toString()} at ${childAddress.toShortString()}`);

      const args = [Fr.fromBuffer(childAddress.toBuffer()), Fr.fromBuffer(childSelector.toBuffer())];
      const result = await runSimulator({ args, artifact: parentArtifact });

      expect(result.callStackItem.publicInputs.returnValues[0]).toEqual(new Fr(privateIncrement));
      expect(oracle.getFunctionArtifact.mock.calls[0]).toEqual([childAddress, childSelector]);
      expect(oracle.getPortalContractAddress.mock.calls[0]).toEqual([childAddress]);
      expect(result.nestedExecutions).toHaveLength(1);
      expect(result.nestedExecutions[0].callStackItem.publicInputs.returnValues[0]).toEqual(new Fr(privateIncrement));

      // check that Aztec.nr calculated the call stack item hash like cpp does
      const expectedCallStackItemHash = result.nestedExecutions[0].callStackItem.hash();
      expect(result.callStackItem.publicInputs.privateCallStackHashes[0]).toEqual(expectedCallStackItemHash);
    });
  });

  describe('nested calls through autogenerated interface', () => {
    let args: any[];
    let argsHash: Fr;
    let testCodeGenArtifact: FunctionArtifact;

    beforeAll(() => {
      // These args should match the ones hardcoded in importer contract
      // eslint-disable-next-line camelcase
      const dummyNote = { amount: 1, secret_hash: 2 };
      // eslint-disable-next-line camelcase
      const deepStruct = { a_field: 1, a_bool: true, a_note: dummyNote, many_notes: [dummyNote, dummyNote, dummyNote] };
      args = [1, true, 1, [1, 2], dummyNote, deepStruct];
      testCodeGenArtifact = getFunctionArtifact(TestContractArtifact, 'test_code_gen');
      const serializedArgs = encodeArguments(testCodeGenArtifact, args);
      argsHash = computeVarArgsHash(serializedArgs);
    });

    it('test function should be directly callable', async () => {
      logger(`Calling testCodeGen function`);
      const result = await runSimulator({ args, artifact: testCodeGenArtifact });

      expect(result.callStackItem.publicInputs.returnValues[0]).toEqual(argsHash);
    });

    it('test function should be callable through autogenerated interface', async () => {
      const testAddress = AztecAddress.random();
      const parentArtifact = getFunctionArtifact(ImportTestContractArtifact, 'main');
      const testCodeGenSelector = FunctionSelector.fromNameAndParameters(
        testCodeGenArtifact.name,
        testCodeGenArtifact.parameters,
      );

      oracle.getFunctionArtifact.mockResolvedValue(testCodeGenArtifact);
      oracle.getPortalContractAddress.mockResolvedValue(EthAddress.ZERO);

      logger(`Calling importer main function`);
      const args = [testAddress];
      const result = await runSimulator({ args, artifact: parentArtifact });

      expect(result.callStackItem.publicInputs.returnValues[0]).toEqual(argsHash);
      expect(oracle.getFunctionArtifact.mock.calls[0]).toEqual([testAddress, testCodeGenSelector]);
      expect(oracle.getPortalContractAddress.mock.calls[0]).toEqual([testAddress]);
      expect(result.nestedExecutions).toHaveLength(1);
      expect(result.nestedExecutions[0].callStackItem.publicInputs.returnValues[0]).toEqual(argsHash);
    });
  });

  describe('consuming messages', () => {
    const contractAddress = defaultContractAddress;

    beforeEach(() => {
      oracle.getCompleteAddress.mockImplementation((address: AztecAddress) => {
        if (address.equals(recipient)) {
          return Promise.resolve(recipientCompleteAddress);
        }
        throw new Error(`Unknown address ${address}`);
      });
    });

    describe('L1 to L2', () => {
      const artifact = getFunctionArtifact(TestContractArtifact, 'consume_mint_private_message');
      const canceller = EthAddress.random();
      let bridgedAmount = 100n;

      const secretHashForRedeemingNotes = new Fr(2n);
      let secretForL1ToL2MessageConsumption = new Fr(1n);

      let crossChainMsgRecipient: AztecAddress | undefined;
      let crossChainMsgSender: EthAddress | undefined;
      let messageKey: Fr | undefined;

      let preimage: L1ToL2Message;

      let args: Fr[];

      beforeEach(() => {
        bridgedAmount = 100n;
        secretForL1ToL2MessageConsumption = new Fr(2n);

        crossChainMsgRecipient = undefined;
        crossChainMsgSender = undefined;
        messageKey = undefined;
      });

      const computePreimage = () =>
        buildL1ToL2Message(
          getFunctionSelector('mint_private(bytes32,uint256,address)').substring(2),
          [secretHashForRedeemingNotes, new Fr(bridgedAmount), canceller.toField()],
          crossChainMsgRecipient ?? contractAddress,
          secretForL1ToL2MessageConsumption,
        );

      const computeArgs = () =>
        encodeArguments(artifact, [
          secretHashForRedeemingNotes,
          bridgedAmount,
          canceller.toField(),
          messageKey ?? preimage.hash(),
          secretForL1ToL2MessageConsumption,
        ]);

      const mockOracles = async () => {
        const tree = await insertLeaves([messageKey ?? preimage.hash()], 'l1ToL2Messages');
        oracle.getL1ToL2Message.mockImplementation(async () => {
          return Promise.resolve(new MessageLoadOracleInputs(preimage, 0n, await tree.getSiblingPath(0n, false)));
        });
      };

      it('Should be able to consume a dummy cross chain message', async () => {
        preimage = computePreimage();

        args = computeArgs();

        await mockOracles();
        // Update state
        oracle.getHeader.mockResolvedValue(header);

        const result = await runSimulator({
          contractAddress,
          artifact,
          args,
          portalContractAddress: crossChainMsgSender ?? preimage.sender.sender,
          txContext: { version: new Fr(1n), chainId: new Fr(1n) },
        });

        // Check a nullifier has been inserted
        const newNullifiers = sideEffectArrayToValueArray(
          nonEmptySideEffects(result.callStackItem.publicInputs.newNullifiers),
        );

        expect(newNullifiers).toHaveLength(1);
      });

      it('Message not matching requested key', async () => {
        messageKey = Fr.random();

        preimage = computePreimage();

        args = computeArgs();

        await mockOracles();
        // Update state
        oracle.getHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact,
            args,
            portalContractAddress: crossChainMsgSender ?? preimage.sender.sender,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrowError('Message not matching requested key');
      });

      it('Invalid membership proof', async () => {
        preimage = computePreimage();

        args = computeArgs();

        await mockOracles();

        await expect(
          runSimulator({
            contractAddress,
            artifact,
            args,
            portalContractAddress: crossChainMsgSender ?? preimage.sender.sender,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrowError('Message not in state');
      });

      it('Invalid recipient', async () => {
        crossChainMsgRecipient = AztecAddress.random();

        preimage = computePreimage();

        args = computeArgs();

        await mockOracles();
        // Update state
        oracle.getHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact,
            args,
            portalContractAddress: crossChainMsgSender ?? preimage.sender.sender,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrowError('Invalid recipient');
      });

      it('Invalid sender', async () => {
        crossChainMsgSender = EthAddress.random();
        preimage = computePreimage();

        args = computeArgs();

        await mockOracles();
        // Update state
        oracle.getHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact,
            args,
            portalContractAddress: crossChainMsgSender ?? preimage.sender.sender,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrowError('Invalid sender');
      });

      it('Invalid chainid', async () => {
        preimage = computePreimage();

        args = computeArgs();

        await mockOracles();
        // Update state
        oracle.getHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact,
            args,
            portalContractAddress: crossChainMsgSender ?? preimage.sender.sender,
            txContext: { version: new Fr(1n), chainId: new Fr(2n) },
          }),
        ).rejects.toThrowError('Invalid Chainid');
      });

      it('Invalid version', async () => {
        preimage = computePreimage();

        args = computeArgs();

        await mockOracles();
        // Update state
        oracle.getHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact,
            args,
            portalContractAddress: crossChainMsgSender ?? preimage.sender.sender,
            txContext: { version: new Fr(2n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrowError('Invalid Version');
      });

      it('Invalid content', async () => {
        preimage = computePreimage();

        bridgedAmount = bridgedAmount + 1n; // Invalid amount
        args = computeArgs();

        await mockOracles();
        // Update state
        oracle.getHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact,
            args,
            portalContractAddress: crossChainMsgSender ?? preimage.sender.sender,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrowError('Invalid Content');
      });

      it('Invalid Secret', async () => {
        preimage = computePreimage();

        secretForL1ToL2MessageConsumption = Fr.random();
        args = computeArgs();

        await mockOracles();
        // Update state
        oracle.getHeader.mockResolvedValue(header);

        await expect(
          runSimulator({
            contractAddress,
            artifact,
            args,
            portalContractAddress: crossChainMsgSender ?? preimage.sender.sender,
            txContext: { version: new Fr(1n), chainId: new Fr(1n) },
          }),
        ).rejects.toThrowError('Invalid message secret');
      });
    });

    it('Should be able to consume a dummy public to private message', async () => {
      const amount = 100n;
      const artifact = getFunctionArtifact(TokenContractArtifact, 'redeem_shield');

      const secret = new Fr(1n);
      const secretHash = computeMessageSecretHash(secret);
      const note = new Note([new Fr(amount), secretHash]);
      const noteHash = hashFields(note.items);
      const storageSlot = new Fr(5);
      const innerNoteHash = hashFields([storageSlot, noteHash]);
      const siloedNoteHash = siloNoteHash(contractAddress, innerNoteHash);
      oracle.getNotes.mockResolvedValue([
        {
          contractAddress,
          storageSlot,
          nonce: Fr.ZERO,
          note,
          innerNoteHash: Fr.ZERO,
          siloedNullifier: Fr.random(),
          index: 1n,
        },
      ]);

      const result = await runSimulator({
        artifact,
        args: [recipient, amount, secret],
      });

      // Check a nullifier has been inserted.
      const newNullifiers = sideEffectArrayToValueArray(
        nonEmptySideEffects(result.callStackItem.publicInputs.newNullifiers),
      );

      expect(newNullifiers).toHaveLength(1);

      // Check the commitment read request was created successfully.
      const readRequests = sideEffectArrayToValueArray(
        nonEmptySideEffects(result.callStackItem.publicInputs.readRequests),
      );

      expect(readRequests).toHaveLength(1);
      expect(readRequests[0]).toEqual(siloedNoteHash);
    });
  });

  describe('enqueued calls', () => {
    it.each([false, true])('parent should enqueue call to child (internal %p)', async isInternal => {
      const parentArtifact = getFunctionArtifact(ParentContractArtifact, 'enqueueCallToChild');
      const childContractArtifact = ParentContractArtifact.functions[0];
      const childAddress = AztecAddress.random();
      const childPortalContractAddress = EthAddress.random();
      const childSelector = FunctionSelector.fromNameAndParameters(
        childContractArtifact.name,
        childContractArtifact.parameters,
      );
      const parentAddress = AztecAddress.random();

      oracle.getPortalContractAddress.mockImplementation(() => Promise.resolve(childPortalContractAddress));
      oracle.getFunctionArtifact.mockImplementation(() => Promise.resolve({ ...childContractArtifact, isInternal }));

      const args = [Fr.fromBuffer(childAddress.toBuffer()), childSelector.toField(), 42n];
      const result = await runSimulator({
        msgSender: parentAddress,
        contractAddress: parentAddress,
        artifact: parentArtifact,
        args,
      });

      // Alter function data to match the manipulated oracle
      const functionData = FunctionData.fromAbi(childContractArtifact);
      functionData.isInternal = isInternal;

      const publicCallRequest = PublicCallRequest.from({
        contractAddress: childAddress,
        functionData: functionData,
        args: [new Fr(42n)],
        callContext: CallContext.from({
          msgSender: parentAddress,
          storageContractAddress: childAddress,
          portalContractAddress: childPortalContractAddress,
          functionSelector: childSelector,
          isContractDeployment: false,
          isDelegateCall: false,
          isStaticCall: false,
          startSideEffectCounter: 2,
        }),
        parentCallContext: CallContext.from({
          msgSender: parentAddress,
          storageContractAddress: parentAddress,
          portalContractAddress: EthAddress.ZERO,
          functionSelector: FunctionSelector.fromNameAndParameters(parentArtifact.name, parentArtifact.parameters),
          isContractDeployment: false,
          isDelegateCall: false,
          isStaticCall: false,
          startSideEffectCounter: 2,
        }),
      });

      const publicCallRequestHash = publicCallRequest.toPublicCallStackItem().hash();

      expect(result.enqueuedPublicFunctionCalls).toHaveLength(1);
      expect(result.enqueuedPublicFunctionCalls[0]).toEqual(publicCallRequest);
      expect(result.callStackItem.publicInputs.publicCallStackHashes[0]).toEqual(publicCallRequestHash);
    });
  });

  describe('pending note hashes contract', () => {
    beforeEach(() => {
      oracle.getCompleteAddress.mockImplementation((address: AztecAddress) => {
        if (address.equals(owner)) {
          return Promise.resolve(ownerCompleteAddress);
        }
        throw new Error(`Unknown address ${address}`);
      });
    });

    beforeEach(() => {
      oracle.getFunctionArtifact.mockImplementation((_, selector) =>
        Promise.resolve(getFunctionArtifactWithSelector(PendingCommitmentsContractArtifact, selector)),
      );
      oracle.getFunctionArtifactByName.mockImplementation((_, functionName: string) =>
        Promise.resolve(getFunctionArtifact(PendingCommitmentsContractArtifact, functionName)),
      );
    });

    it('should be able to insert, read, and nullify pending note hashes in one call', async () => {
      oracle.getNotes.mockResolvedValue([]);

      const amountToTransfer = 100n;

      const contractAddress = AztecAddress.random();
      const artifact = getFunctionArtifact(
        PendingCommitmentsContractArtifact,
        'test_insert_then_get_then_nullify_flat',
      );

      const args = [amountToTransfer, owner];
      const result = await runSimulator({
        args: args,
        artifact: artifact,
        contractAddress,
      });

      expect(result.newNotes).toHaveLength(1);
      const noteAndSlot = result.newNotes[0];
      expect(noteAndSlot.storageSlot).toEqual(computeSlotForMapping(new Fr(1n), owner));

      expect(noteAndSlot.note.items[0]).toEqual(new Fr(amountToTransfer));

      const newNoteHashes = sideEffectArrayToValueArray(
        nonEmptySideEffects(result.callStackItem.publicInputs.newNoteHashes),
      );
      expect(newNoteHashes).toHaveLength(1);

      const noteHash = newNoteHashes[0];
      const storageSlot = computeSlotForMapping(new Fr(1n), owner);
      const noteTypeId = new Fr(869710811710178111116101n); // ValueNote

      const innerNoteHash = await acirSimulator.computeInnerNoteHash(
        contractAddress,
        storageSlot,
        noteTypeId,
        noteAndSlot.note,
      );
      expect(noteHash).toEqual(innerNoteHash);

      // read request should match innerNoteHash for pending notes (there is no nonce, so can't compute "unique" hash)
      const readRequest = sideEffectArrayToValueArray(result.callStackItem.publicInputs.readRequests)[0];
      expect(readRequest).toEqual(innerNoteHash);

      const gotNoteValue = result.callStackItem.publicInputs.returnValues[0].value;
      expect(gotNoteValue).toEqual(amountToTransfer);

      const nullifier = result.callStackItem.publicInputs.newNullifiers[0];
      const siloedNullifierSecretKey = computeSiloedNullifierSecretKey(
        ownerNullifierKeyPair.secretKey,
        contractAddress,
      );
      const expectedNullifier = hashFields([
        innerNoteHash,
        siloedNullifierSecretKey.low,
        siloedNullifierSecretKey.high,
      ]);
      expect(nullifier.value).toEqual(expectedNullifier);
    });

    it('should be able to insert, read, and nullify pending note hashes in nested calls', async () => {
      oracle.getNotes.mockResolvedValue([]);

      const amountToTransfer = 100n;

      const contractAddress = AztecAddress.random();
      const artifact = getFunctionArtifact(
        PendingCommitmentsContractArtifact,
        'test_insert_then_get_then_nullify_all_in_nested_calls',
      );
      const insertArtifact = getFunctionArtifact(PendingCommitmentsContractArtifact, 'insert_note');

      const getThenNullifyArtifact = getFunctionArtifact(PendingCommitmentsContractArtifact, 'get_then_nullify_note');

      const getZeroArtifact = getFunctionArtifact(PendingCommitmentsContractArtifact, 'get_note_zero_balance');

      const insertFnSelector = FunctionSelector.fromNameAndParameters(insertArtifact.name, insertArtifact.parameters);
      const getThenNullifyFnSelector = FunctionSelector.fromNameAndParameters(
        getThenNullifyArtifact.name,
        getThenNullifyArtifact.parameters,
      );
      const getZeroFnSelector = FunctionSelector.fromNameAndParameters(
        getZeroArtifact.name,
        getZeroArtifact.parameters,
      );

      oracle.getPortalContractAddress.mockImplementation(() => Promise.resolve(EthAddress.ZERO));

      const args = [
        amountToTransfer,
        owner,
        insertFnSelector.toField(),
        getThenNullifyFnSelector.toField(),
        getZeroFnSelector.toField(),
      ];
      const result = await runSimulator({
        args: args,
        artifact: artifact,
        contractAddress: contractAddress,
      });

      const execInsert = result.nestedExecutions[0];
      const execGetThenNullify = result.nestedExecutions[1];
      const getNotesAfterNullify = result.nestedExecutions[2];

      const storageSlot = computeSlotForMapping(new Fr(1n), owner);
      const noteTypeId = new Fr(869710811710178111116101n); // ValueNote

      expect(execInsert.newNotes).toHaveLength(1);
      const noteAndSlot = execInsert.newNotes[0];
      expect(noteAndSlot.storageSlot).toEqual(storageSlot);
      expect(noteAndSlot.noteTypeId).toEqual(noteTypeId);

      expect(noteAndSlot.note.items[0]).toEqual(new Fr(amountToTransfer));

      const newNoteHashes = sideEffectArrayToValueArray(
        nonEmptySideEffects(execInsert.callStackItem.publicInputs.newNoteHashes),
      );
      expect(newNoteHashes).toHaveLength(1);

      const noteHash = newNoteHashes[0];
      const innerNoteHash = await acirSimulator.computeInnerNoteHash(
        contractAddress,
        noteAndSlot.storageSlot,
        noteAndSlot.noteTypeId,
        noteAndSlot.note,
      );
      expect(noteHash).toEqual(innerNoteHash);

      // read request should match innerNoteHash for pending notes (there is no nonce, so can't compute "unique" hash)
      const readRequest = execGetThenNullify.callStackItem.publicInputs.readRequests[0];
      expect(readRequest.value).toEqual(innerNoteHash);

      const gotNoteValue = execGetThenNullify.callStackItem.publicInputs.returnValues[0].value;
      expect(gotNoteValue).toEqual(amountToTransfer);

      const nullifier = execGetThenNullify.callStackItem.publicInputs.newNullifiers[0];
      const siloedNullifierSecretKey = computeSiloedNullifierSecretKey(
        ownerNullifierKeyPair.secretKey,
        contractAddress,
      );
      const expectedNullifier = hashFields([
        innerNoteHash,
        siloedNullifierSecretKey.low,
        siloedNullifierSecretKey.high,
      ]);
      expect(nullifier.value).toEqual(expectedNullifier);

      // check that the last get_notes call return no note
      const afterNullifyingNoteValue = getNotesAfterNullify.callStackItem.publicInputs.returnValues[0].value;
      expect(afterNullifyingNoteValue).toEqual(0n);
    });

    it('cant read a commitment that is inserted later in same call', async () => {
      oracle.getNotes.mockResolvedValue([]);

      const amountToTransfer = 100n;

      const contractAddress = AztecAddress.random();

      const artifact = getFunctionArtifact(PendingCommitmentsContractArtifact, 'test_bad_get_then_insert_flat');

      const args = [amountToTransfer, owner];
      const result = await runSimulator({
        args: args,
        artifact: artifact,
        contractAddress,
      });

      const storageSlot = computeSlotForMapping(new Fr(1n), owner);
      const noteTypeId = new Fr(869710811710178111116101n); // ValueNote

      expect(result.newNotes).toHaveLength(1);
      const noteAndSlot = result.newNotes[0];
      expect(noteAndSlot.storageSlot).toEqual(storageSlot);
      expect(noteAndSlot.noteTypeId).toEqual(noteTypeId);

      expect(noteAndSlot.note.items[0]).toEqual(new Fr(amountToTransfer));

      const newNoteHashes = sideEffectArrayToValueArray(
        nonEmptySideEffects(result.callStackItem.publicInputs.newNoteHashes),
      );
      expect(newNoteHashes).toHaveLength(1);

      const noteHash = newNoteHashes[0];
      expect(noteHash).toEqual(
        await acirSimulator.computeInnerNoteHash(
          contractAddress,
          storageSlot,
          noteAndSlot.noteTypeId,
          noteAndSlot.note,
        ),
      );

      // read requests should be empty
      const readRequest = result.callStackItem.publicInputs.readRequests[0].value;
      expect(readRequest).toEqual(Fr.ZERO);

      // should get note value 0 because it actually gets a fake note since the real one hasn't been inserted yet!
      const gotNoteValue = result.callStackItem.publicInputs.returnValues[0];
      expect(gotNoteValue).toEqual(Fr.ZERO);

      // there should be no nullifiers
      const nullifier = result.callStackItem.publicInputs.newNullifiers[0].value;
      expect(nullifier).toEqual(Fr.ZERO);
    });
  });

  describe('get public key', () => {
    it('gets the public key for an address', async () => {
      // Tweak the contract artifact so we can extract return values
      const artifact = getFunctionArtifact(TestContractArtifact, 'get_public_key');
      artifact.returnTypes = [{ kind: 'array', length: 2, type: { kind: 'field' } }];

      // Generate a partial address, pubkey, and resulting address
      const completeAddress = CompleteAddress.random();
      const args = [completeAddress.address];
      const pubKey = completeAddress.publicKey;

      oracle.getCompleteAddress.mockResolvedValue(completeAddress);
      const result = await runSimulator({ artifact, args });
      expect(result.returnValues).toEqual([pubKey.x.value, pubKey.y.value]);
    });
  });

  describe('Context oracles', () => {
    it("Should be able to get and return the contract's portal contract address", async () => {
      const portalContractAddress = EthAddress.random();
      const aztecAddressToQuery = AztecAddress.random();

      // Tweak the contract artifact so we can extract return values
      const artifact = getFunctionArtifact(TestContractArtifact, 'get_portal_contract_address');
      artifact.returnTypes = [{ kind: 'field' }];

      const args = [aztecAddressToQuery.toField()];

      // Overwrite the oracle return value
      oracle.getPortalContractAddress.mockResolvedValue(portalContractAddress);
      const result = await runSimulator({ artifact, args });
      expect(result.returnValues).toEqual(portalContractAddress.toField().value);
    });

    it('this_address should return the current context address', async () => {
      const contractAddress = AztecAddress.random();

      // Tweak the contract artifact so we can extract return values
      const artifact = getFunctionArtifact(TestContractArtifact, 'get_this_address');
      artifact.returnTypes = [{ kind: 'field' }];

      // Overwrite the oracle return value
      const result = await runSimulator({ artifact, args: [], contractAddress });
      expect(result.returnValues).toEqual(contractAddress.toField().value);
    });

    it("this_portal_address should return the current context's portal address", async () => {
      const portalContractAddress = EthAddress.random();

      // Tweak the contract artifact so we can extract return values
      const artifact = getFunctionArtifact(TestContractArtifact, 'get_this_portal_address');
      artifact.returnTypes = [{ kind: 'field' }];

      // Overwrite the oracle return value
      const result = await runSimulator({ artifact, args: [], portalContractAddress });
      expect(result.returnValues).toEqual(portalContractAddress.toField().value);
    });
  });

  describe('Private global variables', () => {
    let chainId: Fr;
    let version: Fr;
    let args: any[];
    let artifact: FunctionArtifact;

    beforeAll(() => {
      chainId = Fr.random();
      version = Fr.random();
      args = [chainId, version];

      artifact = getFunctionArtifact(TestContractArtifact, 'assert_private_global_vars');
      oracle.getFunctionArtifact.mockImplementation(() => Promise.resolve(artifact));
    });

    it('Private global vars are correctly set', () => {
      // Chain id and version set in tx context is the same as the ones we pass via args so this should not throw
      expect(() => runSimulator({ artifact, msgSender: owner, args, txContext: { chainId, version } })).not.toThrow();
    });

    it('Throws when chainId is incorrectly set', async () => {
      // We set the chainId in the tx context to a different value than the one we pass via args so the simulator should throw
      const unexpectedChainId = Fr.random();
      await expect(
        runSimulator({ artifact, msgSender: owner, args, txContext: { chainId: unexpectedChainId, version } }),
      ).rejects.toThrowError('Invalid chain id');
    });

    it('Throws when version is incorrectly set', async () => {
      // We set the version in the tx context to a different value than the one we pass via args so the simulator should throw
      const unexpectedVersion = Fr.random();
      await expect(
        runSimulator({ artifact, msgSender: owner, args, txContext: { chainId, version: unexpectedVersion } }),
      ).rejects.toThrowError('Invalid version');
    });
  });

  describe('Historical header in private context', () => {
    let artifact: FunctionArtifact;

    beforeAll(() => {
      artifact = getFunctionArtifact(TestContractArtifact, 'assert_header_private');
      oracle.getFunctionArtifact.mockImplementation(() => Promise.resolve(artifact));

      header = makeHeader();

      oracle.getHeader.mockClear();
      oracle.getHeader.mockResolvedValue(header);
    });

    it('Header is correctly set', () => {
      const args = [header.hash()];

      expect(() => runSimulator({ artifact, msgSender: owner, args })).not.toThrow();
    });

    it('Throws when header is not as expected', async () => {
      const unexpectedHeaderHash = Fr.random();
      const args = [unexpectedHeaderHash];

      await expect(runSimulator({ artifact, msgSender: owner, args })).rejects.toThrowError('Invalid header hash');
    });
  });
});
