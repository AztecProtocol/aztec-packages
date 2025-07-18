import {
  MAX_INCLUDE_BY_TIMESTAMP_DURATION,
  MAX_NOTE_HASHES_PER_CALL,
  MAX_NOTE_HASHES_PER_TX,
  VK_TREE_HEIGHT,
} from '@aztec/constants';
import { padArrayEnd } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { MembershipWitness } from '@aztec/foundation/trees';
import { FunctionSelector, NoteSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { PrivateKernelProver } from '@aztec/stdlib/interfaces/client';
import {
  ClaimedLengthArray,
  NoteHash,
  PrivateCircuitPublicInputs,
  PrivateKernelCircuitPublicInputs,
  PrivateKernelTailCircuitPublicInputs,
  ScopedNoteHash,
} from '@aztec/stdlib/kernel';
import { PublicKeys } from '@aztec/stdlib/keys';
import { Note } from '@aztec/stdlib/note';
import { makeTxRequest } from '@aztec/stdlib/testing';
import { NoteAndSlot, PrivateCallExecutionResult, PrivateExecutionResult, type TxRequest } from '@aztec/stdlib/tx';
import { VerificationKey, VerificationKeyData } from '@aztec/stdlib/vks';

import { mock } from 'jest-mock-extended';

import { PrivateKernelExecutionProver } from './private_kernel_execution_prover.js';
import type { PrivateKernelOracle } from './private_kernel_oracle.js';

describe('Private Kernel Sequencer', () => {
  let txRequest: TxRequest;
  let oracle: ReturnType<typeof mock<PrivateKernelOracle>>;
  let proofCreator: ReturnType<typeof mock<PrivateKernelProver>>;
  let prover: PrivateKernelExecutionProver;
  let dependencies: { [name: string]: string[] } = {};

  const contractAddress = AztecAddress.fromBigInt(987654n);
  const blockTimestamp = 12345n;
  const includeByTimestamp = blockTimestamp + BigInt(MAX_INCLUDE_BY_TIMESTAMP_DURATION);

  const notesAndSlots: NoteAndSlot[] = Array(10)
    .fill(null)
    .map(() => new NoteAndSlot(new Note([Fr.random(), Fr.random(), Fr.random()]), Fr.random(), NoteSelector.random()));

  const createFakeSiloedCommitment = (commitment: Fr) => new Fr(commitment.value + 1n);
  const generateFakeCommitment = (noteAndSlot: NoteAndSlot) => noteAndSlot.note.items[0];
  const generateFakeSiloedCommitment = (note: NoteAndSlot) => createFakeSiloedCommitment(generateFakeCommitment(note));

  const createExecutionResult = (fnName: string, newNoteIndices: number[] = []): PrivateExecutionResult => {
    return new PrivateExecutionResult(createCallExecutionResult(fnName, newNoteIndices), Fr.zero(), []);
  };

  const createCallExecutionResult = (fnName: string, newNoteIndices: number[] = []): PrivateCallExecutionResult => {
    const publicInputs = PrivateCircuitPublicInputs.empty();
    publicInputs.noteHashes = new ClaimedLengthArray(
      padArrayEnd(
        newNoteIndices.map(newNoteIndex => new NoteHash(generateFakeCommitment(notesAndSlots[newNoteIndex]), 0)),
        NoteHash.empty(),
        MAX_NOTE_HASHES_PER_CALL,
      ),
      newNoteIndices.length,
    );
    publicInputs.callContext.functionSelector = new FunctionSelector(fnName.charCodeAt(0));
    publicInputs.callContext.contractAddress = contractAddress;
    return new PrivateCallExecutionResult(
      Buffer.alloc(0),
      VerificationKey.makeFake().toBuffer(),
      new Map(),
      publicInputs,
      new Map(),
      newNoteIndices.map(idx => notesAndSlots[idx]),
      new Map(),
      [],
      [],
      (dependencies[fnName] || []).map(name => createCallExecutionResult(name)),
      [],
    );
  };

  const simulateProofOutput = (newNoteIndices: number[]) => {
    const publicInputs = PrivateKernelCircuitPublicInputs.empty();
    publicInputs.constants.historicalHeader.globalVariables.timestamp = blockTimestamp;
    publicInputs.includeByTimestamp = includeByTimestamp;
    publicInputs.end.noteHashes = new ClaimedLengthArray(
      padArrayEnd(
        newNoteIndices.map(newNoteIndex =>
          new NoteHash(generateFakeSiloedCommitment(notesAndSlots[newNoteIndex]), 0).scope(contractAddress),
        ),
        ScopedNoteHash.empty(),
        MAX_NOTE_HASHES_PER_TX,
      ),
      newNoteIndices.length,
    );

    return {
      publicInputs,
      verificationKey: VerificationKeyData.empty(),
      outputWitness: new Map(),
      bytecode: Buffer.from([]),
    };
  };

  const simulateProofOutputFinal = (newNoteIndices: number[]) => {
    const publicInputs = PrivateKernelTailCircuitPublicInputs.empty();
    publicInputs.forRollup!.end.noteHashes = padArrayEnd(
      newNoteIndices.map(newNoteIndex => generateFakeSiloedCommitment(notesAndSlots[newNoteIndex])),
      Fr.ZERO,
      MAX_NOTE_HASHES_PER_TX,
    );

    return {
      publicInputs,
      outputWitness: new Map(),
      verificationKey: VerificationKeyData.empty(),
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

  const prove = (executionResult: PrivateExecutionResult) => prover.proveWithKernels(txRequest, executionResult);

  beforeEach(async () => {
    txRequest = makeTxRequest();

    oracle = mock<PrivateKernelOracle>();
    // TODO(dbanks12): will need to mock oracle.getNoteMembershipWitness() to test non-transient reads
    oracle.getVkMembershipWitness.mockResolvedValue(MembershipWitness.random(VK_TREE_HEIGHT));

    oracle.getContractAddressPreimage.mockResolvedValue({
      currentContractClassId: Fr.random(),
      originalContractClassId: Fr.random(),
      publicKeys: await PublicKeys.random(),
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

    prover = new PrivateKernelExecutionProver(oracle, proofCreator, true);
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
