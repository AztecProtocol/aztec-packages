import { type AvmProvingRequest, ProvingRequestType, type PublicExecutionRequest } from '@aztec/circuit-types';
import {
  AvmCircuitInputs,
  AvmCircuitPublicInputs,
  AztecAddress,
  ContractStorageRead,
  ContractStorageUpdateRequest,
  Fr,
  Gas,
  type GasSettings,
  type GlobalVariables,
  type Header,
  L2ToL1Message,
  LogHash,
  MAX_ENQUEUED_CALLS_PER_CALL,
  MAX_L1_TO_L2_MSG_READ_REQUESTS_PER_CALL,
  MAX_L2_TO_L1_MSGS_PER_CALL,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_CALL,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIERS_PER_CALL,
  MAX_NULLIFIER_NON_EXISTENT_READ_REQUESTS_PER_CALL,
  MAX_NULLIFIER_READ_REQUESTS_PER_CALL,
  MAX_PUBLIC_DATA_READS_PER_CALL,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_CALL,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_CALL,
  NoteHash,
  Nullifier,
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
  type PrivateToPublicAccumulatedData,
  PublicCallRequest,
  PublicCircuitPublicInputs,
  PublicDataWrite,
  PublicInnerCallRequest,
  ReadRequest,
  RevertCode,
  type StateReference,
  TreeLeafReadRequest,
  TreeSnapshots,
  countAccumulatedItems,
  mergeAccumulatedData,
} from '@aztec/circuits.js';
import { computeNoteHashNonce, computeUniqueNoteHash, computeVarArgsHash, siloNoteHash } from '@aztec/circuits.js/hash';
import { padArrayEnd } from '@aztec/foundation/collection';
import { assertLength } from '@aztec/foundation/serialize';

import { AvmFinalizedCallResult } from '../avm/avm_contract_call_result.js';
import { AvmExecutionEnvironment } from '../avm/avm_execution_environment.js';
import { type AvmPersistableStateManager } from '../avm/journal/journal.js';
import { type PublicEnqueuedCallSideEffectTrace } from './enqueued_call_side_effect_trace.js';
import { type EnqueuedPublicCallExecutionResult, type PublicFunctionCallResult } from './execution.js';

export function generateAvmCircuitPublicInputs(
  trace: PublicEnqueuedCallSideEffectTrace,
  globalVariables: GlobalVariables,
  startStateReference: StateReference,
  startGasUsed: Gas,
  gasSettings: GasSettings,
  setupCallRequests: PublicCallRequest[],
  appLogicCallRequests: PublicCallRequest[],
  teardownCallRequests: PublicCallRequest[],
  nonRevertibleAccumulatedDataFromPrivate: PrivateToPublicAccumulatedData,
  revertibleAccumulatedDataFromPrivate: PrivateToPublicAccumulatedData,
  endStateReference: StateReference,
  endGasUsed: Gas,
  transactionFee: Fr,
  revertCode: RevertCode,
): AvmCircuitPublicInputs {
  const startTreeSnapshots = new TreeSnapshots(
    startStateReference.l1ToL2MessageTree,
    startStateReference.partial.noteHashTree,
    startStateReference.partial.nullifierTree,
    startStateReference.partial.publicDataTree,
  );
  const endTreeSnapshots = new TreeSnapshots(
    endStateReference.l1ToL2MessageTree,
    endStateReference.partial.noteHashTree,
    endStateReference.partial.nullifierTree,
    endStateReference.partial.publicDataTree,
  );

  const avmCircuitPublicInputs = trace.toAvmCircuitPublicInputs(
    globalVariables,
    startTreeSnapshots,
    startGasUsed,
    gasSettings,
    setupCallRequests,
    appLogicCallRequests,
    teardownCallRequests.length ? teardownCallRequests[0] : PublicCallRequest.empty(),
    endTreeSnapshots,
    endGasUsed,
    transactionFee,
    !revertCode.isOK(),
  );

  const getArrayLengths = (from: PrivateToPublicAccumulatedData) =>
    new PrivateToAvmAccumulatedDataArrayLengths(
      countAccumulatedItems(from.noteHashes),
      countAccumulatedItems(from.nullifiers),
      countAccumulatedItems(from.l2ToL1Msgs),
    );
  const convertAccumulatedData = (from: PrivateToPublicAccumulatedData) =>
    new PrivateToAvmAccumulatedData(from.noteHashes, from.nullifiers, from.l2ToL1Msgs);
  // Temporary overrides as these entries aren't yet populated in trace
  avmCircuitPublicInputs.previousNonRevertibleAccumulatedDataArrayLengths = getArrayLengths(
    nonRevertibleAccumulatedDataFromPrivate,
  );
  avmCircuitPublicInputs.previousRevertibleAccumulatedDataArrayLengths = getArrayLengths(
    revertibleAccumulatedDataFromPrivate,
  );
  avmCircuitPublicInputs.previousNonRevertibleAccumulatedData = convertAccumulatedData(
    nonRevertibleAccumulatedDataFromPrivate,
  );
  avmCircuitPublicInputs.previousRevertibleAccumulatedData = convertAccumulatedData(
    revertibleAccumulatedDataFromPrivate,
  );

  const txHash = avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.nullifiers[0];

  for (
    let revertibleIndex = 0;
    revertibleIndex < avmCircuitPublicInputs.previousRevertibleAccumulatedData.noteHashes.length;
    revertibleIndex++
  ) {
    const noteHash = avmCircuitPublicInputs.previousRevertibleAccumulatedData.noteHashes[revertibleIndex];
    if (noteHash.isZero()) {
      continue;
    }
    const indexInTx =
      revertibleIndex + avmCircuitPublicInputs.previousNonRevertibleAccumulatedDataArrayLengths.noteHashes;

    const nonce = computeNoteHashNonce(txHash, indexInTx);
    const uniqueNoteHash = computeUniqueNoteHash(nonce, noteHash);
    avmCircuitPublicInputs.previousRevertibleAccumulatedData.noteHashes[revertibleIndex] = uniqueNoteHash;
  }

  // merge all revertible & non-revertible side effects into output accumulated data
  const noteHashesFromPrivate = revertCode.isOK()
    ? mergeAccumulatedData(
        avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.noteHashes,
        avmCircuitPublicInputs.previousRevertibleAccumulatedData.noteHashes,
      )
    : avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.noteHashes;
  avmCircuitPublicInputs.accumulatedData.noteHashes = assertLength(
    mergeAccumulatedData(noteHashesFromPrivate, avmCircuitPublicInputs.accumulatedData.noteHashes),
    MAX_NOTE_HASHES_PER_TX,
  );

  const scopedNoteHashesFromPublic = trace.getSideEffects().noteHashes;
  for (let i = 0; i < scopedNoteHashesFromPublic.length; i++) {
    const scopedNoteHash = scopedNoteHashesFromPublic[i];
    const noteHash = scopedNoteHash.value;
    if (!noteHash.isZero()) {
      const noteHashIndexInTx = i + countAccumulatedItems(noteHashesFromPrivate);
      const nonce = computeNoteHashNonce(txHash, noteHashIndexInTx);
      const siloedNoteHash = siloNoteHash(scopedNoteHash.contractAddress, noteHash);
      const uniqueNoteHash = computeUniqueNoteHash(nonce, siloedNoteHash);

      avmCircuitPublicInputs.accumulatedData.noteHashes[noteHashIndexInTx] = uniqueNoteHash;
    }
  }

  const msgsFromPrivate = revertCode.isOK()
    ? mergeAccumulatedData(
        avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs,
        avmCircuitPublicInputs.previousRevertibleAccumulatedData.l2ToL1Msgs,
      )
    : avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.l2ToL1Msgs;
  avmCircuitPublicInputs.accumulatedData.l2ToL1Msgs = assertLength(
    mergeAccumulatedData(msgsFromPrivate, avmCircuitPublicInputs.accumulatedData.l2ToL1Msgs),
    MAX_L2_TO_L1_MSGS_PER_TX,
  );

  const dedupedPublicDataWrites: Array<PublicDataWrite> = [];
  const leafSlotOccurences: Map<bigint, number> = new Map();
  for (const publicDataWrite of avmCircuitPublicInputs.accumulatedData.publicDataWrites) {
    const slot = publicDataWrite.leafSlot.toBigInt();
    const prevOccurrences = leafSlotOccurences.get(slot) || 0;
    leafSlotOccurences.set(slot, prevOccurrences + 1);
  }

  for (const publicDataWrite of avmCircuitPublicInputs.accumulatedData.publicDataWrites) {
    const slot = publicDataWrite.leafSlot.toBigInt();
    const prevOccurrences = leafSlotOccurences.get(slot) || 0;
    if (prevOccurrences === 1) {
      dedupedPublicDataWrites.push(publicDataWrite);
    } else {
      leafSlotOccurences.set(slot, prevOccurrences - 1);
    }
  }

  avmCircuitPublicInputs.accumulatedData.publicDataWrites = padArrayEnd(
    dedupedPublicDataWrites,
    PublicDataWrite.empty(),
    MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  );
  //console.log(`AvmCircuitPublicInputs:\n${inspect(avmCircuitPublicInputs)}`);
  return avmCircuitPublicInputs;
}

export function generateAvmProvingRequest(
  real: boolean,
  fnName: string,
  stateManager: AvmPersistableStateManager,
  historicalHeader: Header,
  globalVariables: GlobalVariables,
  executionRequest: PublicExecutionRequest,
  result: EnqueuedPublicCallExecutionResult,
  allocatedGas: Gas,
  transactionFee: Fr,
): AvmProvingRequest {
  const avmExecutionEnv = new AvmExecutionEnvironment(
    executionRequest.callContext.contractAddress,
    executionRequest.callContext.msgSender,
    executionRequest.callContext.functionSelector,
    /*contractCallDepth=*/ Fr.zero(),
    transactionFee,
    globalVariables,
    executionRequest.callContext.isStaticCall,
    executionRequest.args,
  );

  const avmCallResult = new AvmFinalizedCallResult(result.reverted, result.returnValues, result.endGasLeft);

  // Generate an AVM proving request
  let avmProvingRequest: AvmProvingRequest;
  if (real) {
    const deprecatedFunctionCallResult = stateManager.trace.toPublicFunctionCallResult(
      avmExecutionEnv,
      /*startGasLeft=*/ allocatedGas,
      Buffer.alloc(0),
      avmCallResult,
      fnName,
    );
    const publicInputs = getPublicCircuitPublicInputs(historicalHeader, globalVariables, deprecatedFunctionCallResult);
    avmProvingRequest = makeAvmProvingRequest(publicInputs, deprecatedFunctionCallResult);
  } else {
    avmProvingRequest = emptyAvmProvingRequest();
  }
  return avmProvingRequest;
}

function emptyAvmProvingRequest(): AvmProvingRequest {
  return {
    type: ProvingRequestType.PUBLIC_VM,
    inputs: AvmCircuitInputs.empty(),
  };
}
function makeAvmProvingRequest(inputs: PublicCircuitPublicInputs, result: PublicFunctionCallResult): AvmProvingRequest {
  return {
    type: ProvingRequestType.PUBLIC_VM,
    inputs: new AvmCircuitInputs(
      result.functionName,
      result.calldata,
      inputs,
      result.avmCircuitHints,
      AvmCircuitPublicInputs.empty(),
    ),
  };
}

function getPublicCircuitPublicInputs(
  historicalHeader: Header,
  globalVariables: GlobalVariables,
  result: PublicFunctionCallResult,
) {
  const header = historicalHeader.clone(); // don't modify the original
  header.state.partial.publicDataTree.root = Fr.zero(); // AVM doesn't check this yet

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
      MAX_ENQUEUED_CALLS_PER_CALL,
      `Too many public call requests. Got ${result.publicCallRequests.length} with max being ${MAX_ENQUEUED_CALLS_PER_CALL}`,
    ),
    unencryptedLogsHashes: padArrayEnd(
      result.unencryptedLogsHashes,
      LogHash.empty(),
      MAX_UNENCRYPTED_LOGS_PER_CALL,
      `Too many unencrypted logs. Got ${result.unencryptedLogsHashes.length} with max being ${MAX_UNENCRYPTED_LOGS_PER_CALL}`,
    ),
    historicalHeader: header,
    globalVariables: globalVariables,
    startGasLeft: Gas.from(result.startGasLeft),
    endGasLeft: Gas.from(result.endGasLeft),
    transactionFee: result.transactionFee,
    // TODO(@just-mitch): need better mapping from simulator to revert code.
    revertCode: result.reverted ? RevertCode.APP_LOGIC_REVERTED : RevertCode.OK,
  });
}
