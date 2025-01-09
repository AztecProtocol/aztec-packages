import {
  Note,
  NoteAndSlot,
  PrivateExecutionResult,
  type PrivateKernelProver,
  PublicExecutionRequest,
} from '@aztec/circuit-types';
import {
  CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS,
  FunctionSelector,
  MAX_NOTE_HASHES_PER_CALL,
  MAX_NOTE_HASHES_PER_TX,
  MembershipWitness,
  NoteHash,
  PrivateCircuitPublicInputs,
  PrivateKernelCircuitPublicInputs,
  PrivateKernelTailCircuitPublicInputs,
  PublicKeys,
  ScopedNoteHash,
  type TxRequest,
  VK_TREE_HEIGHT,
  VerificationKey,
  VerificationKeyAsFields,
} from '@aztec/circuits.js';
import { makeTxRequest } from '@aztec/circuits.js/testing';
import { NoteSelector } from '@aztec/foundation/abi';
import { makeTuple } from '@aztec/foundation/array';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';

import { mock } from 'jest-mock-extended';

import { KernelProver } from './kernel_prover.js';
import { type ProvingDataOracle } from './proving_data_oracle.js';

describe('Kernel Prover', () => {
  let txRequest: TxRequest;
  let oracle: ReturnType<typeof mock<ProvingDataOracle>>;
  let proofCreator: ReturnType<typeof mock<PrivateKernelProver>>;
  let prover: KernelProver;
  let dependencies: { [name: string]: string[] } = {};

  const contractAddress = AztecAddress.fromBigInt(987654n);

  const notesAndSlots: NoteAndSlot[] = Array(10)
    .fill(null)
    .map(() => new NoteAndSlot(new Note([Fr.random(), Fr.random(), Fr.random()]), Fr.random(), NoteSelector.random()));

  const createFakeSiloedCommitment = (commitment: Fr) => new Fr(commitment.value + 1n);
  const generateFakeCommitment = (noteAndSlot: NoteAndSlot) => noteAndSlot.note.items[0];
  const generateFakeSiloedCommitment = (note: NoteAndSlot) => createFakeSiloedCommitment(generateFakeCommitment(note));

  const createExecutionResult = (fnName: string, newNoteIndices: number[] = []): PrivateExecutionResult => {
    const publicInputs = PrivateCircuitPublicInputs.empty();
    publicInputs.noteHashes = makeTuple(
      MAX_NOTE_HASHES_PER_CALL,
      i =>
        i < newNoteIndices.length
          ? new NoteHash(generateFakeCommitment(notesAndSlots[newNoteIndices[i]]), 0)
          : NoteHash.empty(),
      0,
    );
    publicInputs.callContext.functionSelector = new FunctionSelector(fnName.charCodeAt(0));
    return new PrivateExecutionResult(
      Buffer.alloc(0),
      VerificationKey.makeFake().toBuffer(),
      new Map(),
      publicInputs,
      new Map(),
      newNoteIndices.map(idx => notesAndSlots[idx]),
      new Map(),
      [],
      (dependencies[fnName] || []).map(name => createExecutionResult(name)),
      [],
      PublicExecutionRequest.empty(),
      [],
    );
  };

  const simulateProofOutput = (newNoteIndices: number[]) => {
    const publicInputs = PrivateKernelCircuitPublicInputs.empty();
    const noteHashes = makeTuple(MAX_NOTE_HASHES_PER_TX, ScopedNoteHash.empty);
    for (let i = 0; i < newNoteIndices.length; i++) {
      noteHashes[i] = new NoteHash(generateFakeSiloedCommitment(notesAndSlots[newNoteIndices[i]]), 0).scope(
        contractAddress,
      );
    }

    publicInputs.end.noteHashes = noteHashes;
    return {
      publicInputs,
      verificationKey: VerificationKeyAsFields.makeEmpty(CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      outputWitness: new Map(),
      bytecode: Buffer.from([]),
    };
  };

  const simulateProofOutputFinal = (newNoteIndices: number[]) => {
    const publicInputs = PrivateKernelTailCircuitPublicInputs.empty();
    const noteHashes = makeTuple(MAX_NOTE_HASHES_PER_TX, () => Fr.ZERO);
    for (let i = 0; i < newNoteIndices.length; i++) {
      noteHashes[i] = generateFakeSiloedCommitment(notesAndSlots[newNoteIndices[i]]);
    }
    publicInputs.forRollup!.end.noteHashes = noteHashes;

    return {
      publicInputs,
      outputWitness: new Map(),
      verificationKey: VerificationKeyAsFields.makeEmpty(CLIENT_IVC_VERIFICATION_KEY_LENGTH_IN_FIELDS),
      bytecode: Buffer.from([]),
    };
  };

  const expectExecution = (fns: string[]) => {
    const callStackItemsInit = proofCreator.simulateInit.mock.calls.map(args =>
      String.fromCharCode(args[0].privateCall.publicInputs.callContext.functionSelector.value),
    );
    const callStackItemsInner = proofCreator.simulateInner.mock.calls.map(args =>
      String.fromCharCode(args[0].privateCall.publicInputs.callContext.functionSelector.value),
    );

    expect(proofCreator.simulateInit).toHaveBeenCalledTimes(Math.min(1, fns.length));
    expect(proofCreator.simulateInner).toHaveBeenCalledTimes(Math.max(0, fns.length - 1));
    expect(callStackItemsInit.concat(callStackItemsInner)).toEqual(fns);
    proofCreator.simulateInner.mockClear();
    proofCreator.simulateInit.mockClear();
  };

  const prove = (executionResult: PrivateExecutionResult) => prover.prove(txRequest, executionResult);

  beforeEach(() => {
    txRequest = makeTxRequest();

    oracle = mock<ProvingDataOracle>();
    // TODO(dbanks12): will need to mock oracle.getNoteMembershipWitness() to test non-transient reads
    oracle.getVkMembershipWitness.mockResolvedValue(MembershipWitness.random(VK_TREE_HEIGHT));

    oracle.getContractAddressPreimage.mockResolvedValue({
      contractClassId: Fr.random(),
      publicKeys: PublicKeys.random(),
      saltedInitializationHash: Fr.random(),
    });
    oracle.getContractClassIdPreimage.mockResolvedValue({
      artifactHash: Fr.random(),
      publicBytecodeCommitment: Fr.random(),
      privateFunctionsRoot: Fr.random(),
    });

    proofCreator = mock<PrivateKernelProver>();
    proofCreator.simulateInit.mockResolvedValue(simulateProofOutput([]));
    proofCreator.simulateInner.mockResolvedValue(simulateProofOutput([]));
    proofCreator.simulateReset.mockResolvedValue(simulateProofOutput([]));
    proofCreator.simulateTail.mockResolvedValue(simulateProofOutputFinal([]));

    prover = new KernelProver(oracle, proofCreator, true);
  });

  it('should create proofs in correct order', async () => {
    {
      dependencies = { a: [] };
      const executionResult = createExecutionResult('a');
      await prove(executionResult);
      expectExecution(['a']);
    }

    {
      dependencies = {
        a: ['b', 'd'],
        b: ['c'],
      };
      const executionResult = createExecutionResult('a');
      await prove(executionResult);
      expectExecution(['a', 'b', 'c', 'd']);
    }

    {
      dependencies = {
        k: ['m', 'o'],
        m: ['q'],
        o: ['n', 'p', 'r'],
      };
      const executionResult = createExecutionResult('k');
      await prove(executionResult);
      expectExecution(['k', 'm', 'q', 'o', 'n', 'p', 'r']);
    }
  });
});
