import { type PublicExecutionRequest, type Tx, TxExecutionPhase } from '@aztec/circuit-types';
import {
  AvmAccumulatedData,
  AvmCircuitPublicInputs,
  type CombinedAccumulatedData,
  CombinedConstantData,
  EnqueuedCallData,
  type Fr,
  type Gas,
  type GlobalVariables,
  type KernelCircuitPublicInputs,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_UNENCRYPTED_LOGS_PER_TX,
  NESTED_RECURSIVE_PROOF_LENGTH,
  type PrivateKernelTailCircuitPublicInputs,
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
  type PrivateToPublicAccumulatedData,
  PublicAccumulatedData,
  type PublicCallRequest,
  PublicDataWrite,
  PublicKernelCircuitPrivateInputs,
  PublicKernelCircuitPublicInputs,
  PublicKernelData,
  PublicValidationRequests,
  RevertCode,
  type StateReference,
  TreeSnapshots,
  type VMCircuitPublicInputs,
  VerificationKeyData,
  countAccumulatedItems,
  makeEmptyProof,
  makeEmptyRecursiveProof,
  mergeAccumulatedData,
} from '@aztec/circuits.js';
import { computeNoteHashNonce, computeUniqueNoteHash, siloNoteHash } from '@aztec/circuits.js/hash';
import { padArrayEnd } from '@aztec/foundation/collection';
import { assertLength } from '@aztec/foundation/serialize';
import { getVKSiblingPath } from '@aztec/noir-protocol-circuits-types';

import { type PublicEnqueuedCallSideEffectTrace } from './enqueued_call_side_effect_trace.js';
import { type PublicKernelCircuitSimulator } from './public_kernel_circuit_simulator.js';

export function getExecutionRequestsByPhase(tx: Tx, phase: TxExecutionPhase): PublicExecutionRequest[] {
  switch (phase) {
    case TxExecutionPhase.SETUP:
      return tx.getNonRevertiblePublicExecutionRequests();
    case TxExecutionPhase.APP_LOGIC:
      return tx.getRevertiblePublicExecutionRequests();
    case TxExecutionPhase.TEARDOWN: {
      const request = tx.getPublicTeardownExecutionRequest();
      return request ? [request] : [];
    }
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}

export function getCallRequestsByPhase(tx: Tx, phase: TxExecutionPhase): PublicCallRequest[] {
  switch (phase) {
    case TxExecutionPhase.SETUP:
      return tx.data.getNonRevertiblePublicCallRequests();
    case TxExecutionPhase.APP_LOGIC:
      return tx.data.getRevertiblePublicCallRequests();
    case TxExecutionPhase.TEARDOWN: {
      const request = tx.data.getTeardownPublicCallRequest();
      return request ? [request] : [];
    }
    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}

// Temporary hack to create PublicKernelCircuitPublicInputs from PrivateKernelTailCircuitPublicInputs.
export function getPublicKernelCircuitPublicInputs(
  data: PrivateKernelTailCircuitPublicInputs,
  globalVariables: GlobalVariables,
) {
  const constants = CombinedConstantData.combine(data.constants, globalVariables);

  const validationRequest = PublicValidationRequests.empty();
  validationRequest.forRollup = data.rollupValidationRequests;

  const convertAccumulatedData = (from: PrivateToPublicAccumulatedData) => {
    const to = PublicAccumulatedData.empty();
    to.noteHashes.forEach((_, i) => (to.noteHashes[i].noteHash.value = from.noteHashes[i]));
    to.nullifiers.forEach((_, i) => (to.nullifiers[i].value = from.nullifiers[i]));
    to.l2ToL1Msgs.forEach((_, i) => (to.l2ToL1Msgs[i] = from.l2ToL1Msgs[i]));
    to.noteEncryptedLogsHashes.forEach((_, i) => (to.noteEncryptedLogsHashes[i] = from.noteEncryptedLogsHashes[i]));
    to.encryptedLogsHashes.forEach((_, i) => (to.encryptedLogsHashes[i] = from.encryptedLogsHashes[i]));
    to.publicCallStack.forEach((_, i) => (to.publicCallStack[i] = from.publicCallRequests[i]));
    return to;
  };

  return new PublicKernelCircuitPublicInputs(
    constants,
    validationRequest,
    convertAccumulatedData(data.forPublic!.nonRevertibleAccumulatedData),
    convertAccumulatedData(data.forPublic!.revertibleAccumulatedData),
    0,
    data.forPublic!.publicTeardownCallRequest,
    data.feePayer,
    RevertCode.OK,
  );
}

// Temporary hack to create the AvmCircuitPublicInputs from public tail's public inputs.
export function generateAvmCircuitPublicInputsDeprecated(
  tx: Tx,
  tailOutput: KernelCircuitPublicInputs,
  gasUsedForFee: Gas,
  transactionFee: Fr,
) {
  const startTreeSnapshots = new TreeSnapshots(
    tailOutput.constants.historicalHeader.state.l1ToL2MessageTree,
    tailOutput.startState.noteHashTree,
    tailOutput.startState.nullifierTree,
    tailOutput.startState.publicDataTree,
  );

  const getArrayLengths = (from: PrivateToPublicAccumulatedData) =>
    new PrivateToAvmAccumulatedDataArrayLengths(
      countAccumulatedItems(from.noteHashes),
      countAccumulatedItems(from.nullifiers),
      countAccumulatedItems(from.l2ToL1Msgs),
    );

  const convertAccumulatedData = (from: PrivateToPublicAccumulatedData) =>
    new PrivateToAvmAccumulatedData(from.noteHashes, from.nullifiers, from.l2ToL1Msgs);

  const convertAvmAccumulatedData = (from: CombinedAccumulatedData) =>
    new AvmAccumulatedData(
      from.noteHashes,
      from.nullifiers,
      from.l2ToL1Msgs,
      from.unencryptedLogsHashes,
      from.publicDataWrites,
    );

  // This is wrong. But this is not used or checked in the rollup at the moment.
  // Should fetch the updated roots from db.
  const endTreeSnapshots = startTreeSnapshots;

  const avmCircuitPublicInputs = new AvmCircuitPublicInputs(
    tailOutput.constants.globalVariables,
    startTreeSnapshots,
    tx.data.gasUsed,
    tx.data.constants.txContext.gasSettings,
    tx.data.forPublic!.nonRevertibleAccumulatedData.publicCallRequests,
    tx.data.forPublic!.revertibleAccumulatedData.publicCallRequests,
    tx.data.forPublic!.publicTeardownCallRequest,
    getArrayLengths(tx.data.forPublic!.nonRevertibleAccumulatedData),
    getArrayLengths(tx.data.forPublic!.revertibleAccumulatedData),
    convertAccumulatedData(tx.data.forPublic!.nonRevertibleAccumulatedData),
    convertAccumulatedData(tx.data.forPublic!.revertibleAccumulatedData),
    endTreeSnapshots,
    gasUsedForFee,
    convertAvmAccumulatedData(tailOutput.end),
    transactionFee,
    !tailOutput.revertCode.equals(RevertCode.OK),
  );
  //console.log(`Old AvmCircuitPublicInputs:\n${inspect(avmCircuitPublicInputs)}`);
  return avmCircuitPublicInputs;
}

function getPreviousKernelData(previousOutput: PublicKernelCircuitPublicInputs): PublicKernelData {
  // The proof is not used in simulation.
  const proof = makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH);

  const vk = VerificationKeyData.makeFakeHonk();
  const vkIndex = 0;
  const siblingPath = getVKSiblingPath(vkIndex);

  return new PublicKernelData(previousOutput, proof, vk, vkIndex, siblingPath);
}

export async function runMergeKernelCircuit(
  previousOutput: PublicKernelCircuitPublicInputs,
  enqueuedCallData: VMCircuitPublicInputs,
  publicKernelSimulator: PublicKernelCircuitSimulator,
): Promise<PublicKernelCircuitPublicInputs> {
  const previousKernel = getPreviousKernelData(previousOutput);

  // The proof is not used in simulation.
  const vmProof = makeEmptyProof();
  const callData = new EnqueuedCallData(enqueuedCallData, vmProof);

  const inputs = new PublicKernelCircuitPrivateInputs(previousKernel, callData);

  return await publicKernelSimulator.publicKernelCircuitMerge(inputs);
}

export function generateAvmCircuitPublicInputs(
  tx: Tx,
  trace: PublicEnqueuedCallSideEffectTrace,
  globalVariables: GlobalVariables,
  startStateReference: StateReference,
  endStateReference: StateReference,
  endGasUsed: Gas,
  transactionFee: Fr,
  revertCode: RevertCode,
  firstPublicKernelOutput: PublicKernelCircuitPublicInputs,
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
    tx.data.gasUsed,
    tx.data.constants.txContext.gasSettings,
    tx.data.forPublic!.nonRevertibleAccumulatedData.publicCallRequests,
    tx.data.forPublic!.revertibleAccumulatedData.publicCallRequests,
    tx.data.forPublic!.publicTeardownCallRequest,
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
    tx.data.forPublic!.nonRevertibleAccumulatedData,
  );
  avmCircuitPublicInputs.previousRevertibleAccumulatedDataArrayLengths = getArrayLengths(
    tx.data.forPublic!.revertibleAccumulatedData,
  );
  avmCircuitPublicInputs.previousNonRevertibleAccumulatedData = convertAccumulatedData(
    tx.data.forPublic!.nonRevertibleAccumulatedData,
  );
  avmCircuitPublicInputs.previousRevertibleAccumulatedData = convertAccumulatedData(
    tx.data.forPublic!.revertibleAccumulatedData,
  );

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

  const txHash = avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.nullifiers[0];

  const scopedNoteHashesFromPublic = trace.getSideEffects().noteHashes;
  for (let i = 0; i < scopedNoteHashesFromPublic.length; i++) {
    const scopedNoteHash = scopedNoteHashesFromPublic[i];
    const noteHash = scopedNoteHash.value;
    if (!noteHash.isZero()) {
      const noteHashIndexInTx = i + countAccumulatedItems(noteHashesFromPrivate);
      const nonce = computeNoteHashNonce(txHash, noteHashIndexInTx);
      const uniqueNoteHash = computeUniqueNoteHash(nonce, noteHash);
      const siloedNoteHash = siloNoteHash(scopedNoteHash.contractAddress, uniqueNoteHash);
      avmCircuitPublicInputs.accumulatedData.noteHashes[noteHashIndexInTx] = siloedNoteHash;
    }
  }

  const nullifiersFromPrivate = revertCode.isOK()
    ? mergeAccumulatedData(
        avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.nullifiers,
        avmCircuitPublicInputs.previousRevertibleAccumulatedData.nullifiers,
      )
    : avmCircuitPublicInputs.previousNonRevertibleAccumulatedData.nullifiers;
  avmCircuitPublicInputs.accumulatedData.nullifiers = assertLength(
    mergeAccumulatedData(nullifiersFromPrivate, avmCircuitPublicInputs.accumulatedData.nullifiers),
    MAX_NULLIFIERS_PER_TX,
  );
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
  const ulogsFromPrivate = revertCode.isOK()
    ? mergeAccumulatedData(
        firstPublicKernelOutput.endNonRevertibleData.unencryptedLogsHashes,
        firstPublicKernelOutput.end.unencryptedLogsHashes,
      )
    : firstPublicKernelOutput.endNonRevertibleData.unencryptedLogsHashes;
  avmCircuitPublicInputs.accumulatedData.unencryptedLogsHashes = assertLength(
    mergeAccumulatedData(ulogsFromPrivate, avmCircuitPublicInputs.accumulatedData.unencryptedLogsHashes),
    MAX_UNENCRYPTED_LOGS_PER_TX,
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
  //console.log(`New AvmCircuitPublicInputs:\n${inspect(avmCircuitPublicInputs)}`);
  return avmCircuitPublicInputs;
}
