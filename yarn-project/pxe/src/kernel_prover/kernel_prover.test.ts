import { Note } from '@aztec/circuit-types';
import { BBNativePrivateKernelProver } from '@aztec/bb-prover';
// import { createConsoleLogger } from '@aztec/foundation/log';
// import { createDebugLogger } from '@aztec/foundation/log';
import {
  FunctionData,
  FunctionSelector,
  MAX_NEW_NOTE_HASHES_PER_CALL,
  MembershipWitness,
  NoteHash,
  PrivateCallStackItem,
  PrivateCircuitPublicInputs,
  PublicCallRequest,
  type TxRequest,
  VK_TREE_HEIGHT,
  VerificationKey,
} from '@aztec/circuits.js';
import { makeTxRequest } from '@aztec/circuits.js/testing';
import { NoteSelector } from '@aztec/foundation/abi';
import { makeTuple } from '@aztec/foundation/array';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { type ExecutionResult, type NoteAndSlot } from '@aztec/simulator';

import { mock } from 'jest-mock-extended';

import { KernelProver } from './kernel_prover.js';
import { type ProvingDataOracle } from './proving_data_oracle.js';

// TODO(#7374) should we revive this?

describe('Kernel Prover Native', () => {
  let txRequest: TxRequest;
  let oracle: ReturnType<typeof mock<ProvingDataOracle>>;
  let proofCreator: BBNativePrivateKernelProver;
  let prover: KernelProver;
  let dependencies: { [name: string]: string[] } = {};


  const notesAndSlots: NoteAndSlot[] = Array(10)
    .fill(null)
    .map(() => ({
      note: new Note([Fr.random(), Fr.random(), Fr.random()]),
      storageSlot: Fr.random(),
      noteTypeId: NoteSelector.random(),
      owner: { x: Fr.random(), y: Fr.random() },
    }));

  // const createFakeSiloedCommitment = (commitment: Fr) => new Fr(commitment.value + 1n);
  const generateFakeCommitment = (noteAndSlot: NoteAndSlot) => noteAndSlot.note.items[0];
  // const generateFakeSiloedCommitment = (note: NoteAndSlot) => createFakeSiloedCommitment(generateFakeCommitment(note));

  const createExecutionResult = (fnName: string, newNoteIndices: number[] = []): ExecutionResult => {
    const publicInputs = PrivateCircuitPublicInputs.empty();
    publicInputs.newNoteHashes = makeTuple(
      MAX_NEW_NOTE_HASHES_PER_CALL,
      i =>
        i < newNoteIndices.length
          ? new NoteHash(generateFakeCommitment(notesAndSlots[newNoteIndices[i]]), 0)
          : NoteHash.empty(),
      0,
    );
    const functionData = FunctionData.empty();
    functionData.selector = new FunctionSelector(fnName.charCodeAt(0));
    return {
      callStackItem: new PrivateCallStackItem(AztecAddress.ZERO, functionData, publicInputs),
      nestedExecutions: (dependencies[fnName] || []).map(name => createExecutionResult(name)),
      vk: VerificationKey.makeFake().toBuffer(),
      newNotes: newNoteIndices.map(idx => notesAndSlots[idx]),
      nullifiedNoteHashCounters: new Map(),
      noteHashLeafIndexMap: new Map(),
      returnValues: [],
      acir: Buffer.alloc(0),
      partialWitness: new Map(),
      enqueuedPublicFunctionCalls: [],
      publicTeardownFunctionCall: PublicCallRequest.empty(),
      noteEncryptedLogs: [],
      encryptedLogs: [],
      unencryptedLogs: [],
    };
  };

  // const createProofOutput = (newNoteIndices: number[]) => {
  //   const publicInputs = PrivateKernelCircuitPublicInputs.empty();
  //   const noteHashes = makeTuple(MAX_NEW_NOTE_HASHES_PER_TX, ScopedNoteHash.empty);
  //   for (let i = 0; i < newNoteIndices.length; i++) {
  //     noteHashes[i] = new NoteHash(generateFakeSiloedCommitment(notesAndSlots[newNoteIndices[i]]), 0).scope(
  //       0,
  //       contractAddress,
  //     );
  //   }

  //   publicInputs.end.newNoteHashes = noteHashes;
  //   return {
  //     publicInputs,
  //     proof: makeRecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>(NESTED_RECURSIVE_PROOF_LENGTH),
  //     verificationKey: VerificationKeyAsFields.makeEmpty(),
  //   };
  // };

  // const createProofOutputFinal = (newNoteIndices: number[]) => {
  //   const publicInputs = PrivateKernelTailCircuitPublicInputs.empty();
  //   const noteHashes = makeTuple(MAX_NEW_NOTE_HASHES_PER_TX, () => Fr.ZERO);
  //   for (let i = 0; i < newNoteIndices.length; i++) {
  //     noteHashes[i] = generateFakeSiloedCommitment(notesAndSlots[newNoteIndices[i]]);
  //   }
  //   publicInputs.forRollup!.end.newNoteHashes = noteHashes;

  //   return {
  //     publicInputs,
  //     proof: makeRecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>(NESTED_RECURSIVE_PROOF_LENGTH),
  //     verificationKey: VerificationKeyAsFields.makeEmpty(),
  //   };
  // };

  // const computeAppCircuitVerificationKeyOutput = () => {
  //   return {
  //     proof: makeRecursiveProof<typeof RECURSIVE_PROOF_LENGTH>(RECURSIVE_PROOF_LENGTH),
  //     verificationKey: VerificationKeyAsFields.makeEmpty(),
  //   };
  // };

  // const expectExecution = (fns: string[]) => {
  //   const callStackItemsInit = proofCreator.simulateProofInit.mock.calls.map(args =>
  //     String.fromCharCode(args[0].privateCall.callStackItem.functionData.selector.value),
  //   );
  //   const callStackItemsInner = proofCreator.simulateProofInner.mock.calls.map(args =>
  //     String.fromCharCode(args[0].privateCall.callStackItem.functionData.selector.value),
  //   );

  //   expect(proofCreator.simulateProofInit).toHaveBeenCalledTimes(Math.min(1, fns.length));
  //   expect(proofCreator.simulateProofInner).toHaveBeenCalledTimes(Math.max(0, fns.length - 1));
  //   expect(callStackItemsInit.concat(callStackItemsInner)).toEqual(fns);
  //   proofCreator.simulateProofInner.mockClear();
  //   proofCreator.simulateProofInit.mockClear();
  // };

  const prove = (executionResult: ExecutionResult) => prover.prove(txRequest, executionResult);

  beforeEach(() => {
    txRequest = makeTxRequest();

    oracle = mock<ProvingDataOracle>();
    // TODO(dbanks12): will need to mock oracle.getNoteMembershipWitness() to test non-transient reads
    oracle.getVkMembershipWitness.mockResolvedValue(MembershipWitness.random(VK_TREE_HEIGHT));

    oracle.getContractAddressPreimage.mockResolvedValue({
      contractClassId: Fr.random(),
      publicKeysHash: Fr.random(),
      saltedInitializationHash: Fr.random(),
    });
    oracle.getContractClassIdPreimage.mockResolvedValue({
      artifactHash: Fr.random(),
      publicBytecodeCommitment: Fr.random(),
      privateFunctionsRoot: Fr.random(),
    });

    const {
      // BB_RELEASE_DIR = 'barretenberg/cpp/build/bin',
      BB_BINARY_PATH,
      // TEMP_DIR = tmpdir(),
      BB_WORKING_DIRECTORY = '',
    } = process.env;

    proofCreator = new BBNativePrivateKernelProver(
      BB_BINARY_PATH!,
      BB_WORKING_DIRECTORY
    );
    // proofCreator.getSiloedCommitments.mockImplementation(publicInputs =>
    //   Promise.resolve(publicInputs.newNoteHashes.map(com => createFakeSiloedCommitment(com.value))),
    // );
    // proofCreator.simulateProofInit.mockResolvedValue(createProofOutput([]));
    // proofCreator.simulateProofInner.mockResolvedValue(createProofOutput([]));
    // proofCreator.simulateProofReset.mockResolvedValue(createProofOutput([]));
    // proofCreator.simulateProofTail.mockResolvedValue(createProofOutputFinal([]));
    // proofCreator.computeAppCircuitVerificationKey.mockResolvedValue(computeAppCircuitVerificationKeyOutput());

    prover = new KernelProver(oracle, proofCreator);
  });

  it('should create proofs in correct order', async () => {
    {
      dependencies = { a: [] };
      const executionResult = createExecutionResult('a');
      await prove(executionResult);
      // expectExecution(['a']);
    }

    // {
    //   dependencies = {
    //     a: ['b', 'd'],
    //     b: ['c'],
    //   };
    //   const executionResult = createExecutionResult('a');
    //   await prove(executionResult);
    //   // expectExecution(['a', 'b', 'c', 'd']);
    // }

    // {
    //   dependencies = {
    //     k: ['m', 'o'],
    //     m: ['q'],
    //     o: ['n', 'p', 'r'],
    //   };
    //   const executionResult = createExecutionResult('k');
    //   await prove(executionResult);
    //   // expectExecution(['k', 'm', 'q', 'o', 'n', 'p', 'r']);
    // }
  });
});
