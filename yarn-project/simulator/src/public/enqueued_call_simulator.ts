import {
  type AvmProvingRequest,
  MerkleTreeId,
  NestedProcessReturnValues,
  ProvingRequestType,
  type PublicExecutionRequest,
  PublicKernelPhase,
  type SimulationError,
  UnencryptedFunctionL2Logs,
} from '@aztec/circuit-types';
import {
  AvmCircuitInputs,
  AztecAddress,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  Fr,
  Gas,
  type GlobalVariables,
  type Header,
  L2ToL1Message,
  LogHash,
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL,
  MAX_L2_GAS_PER_ENQUEUED_CALL,
  MAX_L2_TO_L1_MSGS_PER_CALL,
  MAX_NOTE_HASHES_PER_CALL,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIERS_PER_CALL,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
  MAX_PUBLIC_DATA_READS_PER_CALL,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
  MAX_UNENCRYPTED_LOGS_PER_CALL,
  NoteHash,
  Nullifier,
  PublicAccumulatedDataArrayLengths,
  PublicCallData,
  type PublicCallRequest,
  PublicCircuitPublicInputs,
  PublicInnerCallRequest,
  type PublicKernelCircuitPublicInputs,
  PublicValidationRequestArrayLengths,
  ReadRequest,
  RevertCode,
  TreeLeafReadRequest,
  type VMCircuitPublicInputs,
  makeEmptyProof,
} from '@aztec/circuits.js';
import { computeVarArgsHash } from '@aztec/circuits.js/hash';
import { padArrayEnd } from '@aztec/foundation/collection';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { type MerkleTreeReadOperations } from '@aztec/world-state';

import { AvmContractCallResult } from '../avm/avm_contract_call_result.js';
import { type AvmPersistableStateManager } from '../avm/journal/journal.js';
import { type PublicExecutionResult } from './execution.js';
import { type PublicExecutor, createAvmExecutionEnvironment } from './executor.js';

function makeAvmProvingRequest(inputs: PublicCircuitPublicInputs, result: PublicExecutionResult): AvmProvingRequest {
  return {
    type: ProvingRequestType.PUBLIC_VM,
    inputs: new AvmCircuitInputs(result.functionName, result.calldata, inputs, result.avmCircuitHints),
  };
}

export type EnqueuedCallResult = {
  /** Inputs to be used for proving */
  avmProvingRequest: AvmProvingRequest;
  /** The public kernel output at the end of the enqueued call */
  kernelOutput: VMCircuitPublicInputs;
  /** Unencrypted logs generated during the execution of this enqueued call */
  newUnencryptedLogs: UnencryptedFunctionL2Logs;
  /** Return values of simulating complete callstack */
  returnValues: NestedProcessReturnValues;
  /** Gas used during the execution this enqueued call */
  gasUsed: Gas;
  /** Revert reason, if any */
  revertReason?: SimulationError;
  /** Did call revert? */
  reverted?: boolean;
};

export class EnqueuedCallSimulator {
  private log: DebugLogger;
  constructor(
    private db: MerkleTreeReadOperations,
    private publicExecutor: PublicExecutor,
    private globalVariables: GlobalVariables,
    private historicalHeader: Header,
  ) {
    this.log = createDebugLogger(`aztec:sequencer`);
  }

  async simulate(
    callRequest: PublicCallRequest,
    executionRequest: PublicExecutionRequest,
    previousPublicKernelOutput: PublicKernelCircuitPublicInputs,
    availableGas: Gas,
    transactionFee: Fr,
    phase: PublicKernelPhase,
    stateManager: AvmPersistableStateManager,
  ): Promise<EnqueuedCallResult> {
    // Gas allocated to an enqueued call can be different from the available gas
    // if there is more gas available than the max allocation per enqueued call.
    const allocatedGas = new Gas(
      /*daGas=*/ availableGas.daGas,
      /*l2Gas=*/ Math.min(availableGas.l2Gas, MAX_L2_GAS_PER_ENQUEUED_CALL),
    );
    // TODO(dbanks12): remove or properly use to update state manager on fork?
    const _pendingNullifiers = this.getSiloedPendingNullifiers(previousPublicKernelOutput);

    const prevAccumulatedData =
      phase === PublicKernelPhase.SETUP
        ? previousPublicKernelOutput.endNonRevertibleData
        : previousPublicKernelOutput.end;
    const previousValidationRequestArrayLengths = PublicValidationRequestArrayLengths.new(
      previousPublicKernelOutput.validationRequests,
    );
    const previousAccumulatedDataArrayLengths = PublicAccumulatedDataArrayLengths.new(prevAccumulatedData);

    // If this is the first enqueued call in public, constants will be empty
    // because private kernel does not expose them.
    const constants = previousPublicKernelOutput.constants.clone();
    constants.globalVariables = this.globalVariables;

    const result = await this.publicExecutor.simulate(
      stateManager,
      executionRequest,
      this.globalVariables,
      allocatedGas,
      transactionFee,
    );
    const vmCircuitPublicInputs = stateManager.trace.toVMCircuitPublicInputs(
      constants,
      createAvmExecutionEnvironment(executionRequest, constants.globalVariables, transactionFee),
      allocatedGas,
      result.endGasLeft,
      new AvmContractCallResult(result.reverted, []),
    );
    vmCircuitPublicInputs.callRequest.counter = callRequest.counter;
    // TODO: FIX. For now, override this because it is hardcoded to be only non-revertible lengths in EnqueuedCallsProcessor
    vmCircuitPublicInputs.previousAccumulatedDataArrayLengths = previousAccumulatedDataArrayLengths;
    vmCircuitPublicInputs.previousValidationRequestArrayLengths = previousValidationRequestArrayLengths;

    const callData = await this.getPublicCallData(result);
    const avmProvingRequest = makeAvmProvingRequest(callData.publicInputs, result);
    const gasUsed = allocatedGas.sub(Gas.from(result.endGasLeft));
    return {
      avmProvingRequest,
      kernelOutput: vmCircuitPublicInputs,
      newUnencryptedLogs: new UnencryptedFunctionL2Logs(stateManager!.trace.getUnencryptedLogs()),
      returnValues: new NestedProcessReturnValues(result.returnValues),
      gasUsed,
      revertReason: result.revertReason,
      reverted: result.reverted,
    };
  }

  /** Returns all pending private and public nullifiers. */
  private getSiloedPendingNullifiers(ko: PublicKernelCircuitPublicInputs) {
    return [...ko.end.nullifiers, ...ko.endNonRevertibleData.nullifiers].filter(n => !n.isEmpty());
  }

  /**
   * Calculates the PublicCircuitOutput for this execution result along with its proof,
   * and assembles a PublicCallData object from it.
   * @param result - The execution result.
   * @returns A corresponding PublicCallData object.
   */
  private async getPublicCallData(result: PublicExecutionResult) {
    const bytecodeHash = await this.getBytecodeHash(result);
    const publicInputs = await this.getPublicCircuitPublicInputs(result);
    return new PublicCallData(publicInputs, makeEmptyProof(), bytecodeHash);
  }

  private async getPublicCircuitPublicInputs(result: PublicExecutionResult) {
    const publicDataTreeInfo = await this.db.getTreeInfo(MerkleTreeId.PUBLIC_DATA_TREE);
    this.historicalHeader.state.partial.publicDataTree.root = Fr.fromBuffer(publicDataTreeInfo.root);

    return PublicCircuitPublicInputs.from({
      callContext: result.executionRequest.callContext,
      proverAddress: AztecAddress.ZERO,
      argsHash: computeVarArgsHash(result.executionRequest.args),
      noteHashes: padArrayEnd(
        result.noteHashes,
        NoteHash.empty(),
        MAX_NOTE_HASHES_PER_CALL,
        `Too many note hashes. Got ${result.noteHashes.length} with max being ${MAX_NOTE_HASHES_PER_CALL}`,
      ),
      nullifiers: padArrayEnd(
        result.nullifiers,
        Nullifier.empty(),
        MAX_NULLIFIERS_PER_CALL,
        `Too many nullifiers. Got ${result.nullifiers.length} with max being ${MAX_NULLIFIERS_PER_CALL}`,
      ),
      l2ToL1Msgs: padArrayEnd(
        result.l2ToL1Messages,
        L2ToL1Message.empty(),
        MAX_L2_TO_L1_MSGS_PER_CALL,
        `Too many L2 to L1 messages. Got ${result.l2ToL1Messages.length} with max being ${MAX_L2_TO_L1_MSGS_PER_CALL}`,
      ),
      startSideEffectCounter: result.startSideEffectCounter,
      endSideEffectCounter: result.endSideEffectCounter,
      returnsHash: computeVarArgsHash(result.returnValues),
      noteHashReadRequests: padArrayEnd(
        result.noteHashReadRequests,
        TreeLeafReadRequest.empty(),
        MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
        `Too many note hash read requests. Got ${result.noteHashReadRequests.length} with max being ${MAX_NOTE_HASH_READ_REQUESTS_PER_CALL}`,
      ),
      nullifierReadRequests: padArrayEnd(
        result.nullifierReadRequests,
        ReadRequest.empty(),
        MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
        `Too many nullifier read requests. Got ${result.nullifierReadRequests.length} with max being ${MAX_NULLIFIER_READ_REQUESTS_PER_CALL}`,
      ),
      nullifierNonExistentReadRequests: padArrayEnd(
        result.nullifierNonExistentReadRequests,
        ReadRequest.empty(),
        MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL,
        `Too many nullifier non-existent read requests. Got ${result.nullifierNonExistentReadRequests.length} with max being ${MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL}`,
      ),
      l1ToL2MsgReadRequests: padArrayEnd(
        result.l1ToL2MsgReadRequests,
        TreeLeafReadRequest.empty(),
        MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL,
        `Too many L1 to L2 message read requests. Got ${result.l1ToL2MsgReadRequests.length} with max being ${MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL}`,
      ),
      contractStorageReads: padArrayEnd(
        result.contractStorageReads,
        ContractStorageRead.empty(),
        MAX_PUBLIC_DATA_READS_PER_CALL,
        `Too many public data reads. Got ${result.contractStorageReads.length} with max being ${MAX_PUBLIC_DATA_READS_PER_CALL}`,
      ),
      contractStorageUpdateRequests: padArrayEnd(
        result.contractStorageUpdateRequests,
        ContractStorageUpdateRequest.empty(),
        MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
        `Too many public data update requests. Got ${result.contractStorageUpdateRequests.length} with max being ${MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL}`,
      ),
      publicCallRequests: padArrayEnd(
        result.publicCallRequests,
        PublicInnerCallRequest.empty(),
        MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL,
        `Too many public call requests. Got ${result.publicCallRequests.length} with max being ${MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL}`,
      ),
      unencryptedLogsHashes: padArrayEnd(
        result.unencryptedLogsHashes,
        LogHash.empty(),
        MAX_UNENCRYPTED_LOGS_PER_CALL,
        `Too many unencrypted logs. Got ${result.unencryptedLogsHashes.length} with max being ${MAX_UNENCRYPTED_LOGS_PER_CALL}`,
      ),
      historicalHeader: this.historicalHeader,
      globalVariables: this.globalVariables,
      startGasLeft: Gas.from(result.startGasLeft),
      endGasLeft: Gas.from(result.endGasLeft),
      transactionFee: result.transactionFee,
      // TODO(@just-mitch): need better mapping from simulator to revert code.
      revertCode: result.reverted ? RevertCode.APP_LOGIC_REVERTED : RevertCode.OK,
    });
  }

  private getBytecodeHash(_result: PublicExecutionResult) {
    // TODO: Determine how to calculate bytecode hash. Circuits just check it isn't zero for now.
    // See https://github.com/AztecProtocol/aztec3-packages/issues/378
    const bytecodeHash = new Fr(1n);
    return Promise.resolve(bytecodeHash);
  }
}
