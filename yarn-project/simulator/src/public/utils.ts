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
  NESTED_RECURSIVE_PROOF_LENGTH,
  type PrivateKernelTailCircuitPublicInputs,
  PrivateToAvmAccumulatedData,
  PrivateToAvmAccumulatedDataArrayLengths,
  type PrivateToPublicAccumulatedData,
  PublicAccumulatedData,
  type PublicCallRequest,
  PublicKernelCircuitPrivateInputs,
  PublicKernelCircuitPublicInputs,
  PublicKernelData,
  PublicValidationRequests,
  RevertCode,
  TreeSnapshots,
  type VMCircuitPublicInputs,
  VerificationKeyData,
  countAccumulatedItems,
  makeEmptyProof,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import { getVKSiblingPath } from '@aztec/noir-protocol-circuits-types';

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
export function generateAvmCircuitPublicInputs(
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

  const avmCircuitpublicInputs = new AvmCircuitPublicInputs(
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
  //console.log(`[FROM TAIL] AVM: ${inspect(avmCircuitpublicInputs, { depth: 5 })}`);
  return avmCircuitpublicInputs;
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
