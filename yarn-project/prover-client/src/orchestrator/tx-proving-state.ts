import {
  AVM_REQUEST,
  type AvmProvingRequest,
  type MerkleTreeId,
  type ProcessedTx,
  ProvingRequestType,
  type PublicKernelRequest,
} from '@aztec/circuit-types';
import {
  type AppendOnlyTreeSnapshot,
  type BaseRollupInputs,
  type NESTED_RECURSIVE_PROOF_LENGTH,
  type Proof,
  type RECURSIVE_PROOF_LENGTH,
  type RecursiveProof,
  type VerificationKeyData,
  makeEmptyProof,
} from '@aztec/circuits.js';

export enum TX_PROVING_CODE {
  NOT_READY,
  READY,
  COMPLETED,
}

export type PublicFunction = {
  vmRequest: AvmProvingRequest | undefined;
  vmProof: Proof | undefined;
  previousProofType: ProvingRequestType;
  previousKernelProven: boolean;
  publicKernelRequest: PublicKernelRequest;
};

// Type encapsulating the instruction to the orchestrator as to what
// needs to be proven next
export type TxProvingInstruction = {
  code: TX_PROVING_CODE;
  function: PublicFunction | undefined;
  functionIndex?: number;
};

/**
 * Helper class to manage the proving cycle of a transaction
 * This includes the public VMs and the public kernels
 * Also stores the inputs to the base rollup for this transaction and the tree snapshots
 */
export class TxProvingState {
  private publicFunctions: PublicFunction[] = [];

  constructor(
    public readonly processedTx: ProcessedTx,
    public readonly baseRollupInputs: BaseRollupInputs,
    public readonly treeSnapshots: Map<MerkleTreeId, AppendOnlyTreeSnapshot>,
  ) {
    let previousProofType = ProvingRequestType.TUBE_PROOF;
    for (let i = 0; i < processedTx.publicProvingRequests.length; i++) {
      const provingRequest = processedTx.publicProvingRequests[i];
      const publicKernelRequest = provingRequest.type === AVM_REQUEST ? provingRequest.kernelRequest : provingRequest;
      const vmRequest = provingRequest.type === AVM_REQUEST ? provingRequest : undefined;
      // TODO(#7124): Remove this temporary hack.
      // There's no previous kernel for the first inner kernel in a chain of AvmProvingRequests.
      // Setting its previousKernelProven to be true so that it will be ready once the vm proof is generated.
      const previousKernelProven = !!vmRequest && previousProofType !== ProvingRequestType.PUBLIC_KERNEL_INNER;
      const vmProof = provingRequest.type === ProvingRequestType.PUBLIC_KERNEL_TAIL ? makeEmptyProof() : undefined;
      const publicFunction: PublicFunction = {
        vmRequest,
        vmProof,
        previousProofType,
        previousKernelProven,
        publicKernelRequest: {
          type: publicKernelRequest.type,
          // We take a deep copy (clone) of the inputs to be modified here and passed to the prover.
          // bb-prover will also modify the inputs by reference.
          inputs: publicKernelRequest.inputs.clone(),
        } as PublicKernelRequest,
      };
      this.publicFunctions.push(publicFunction);
      previousProofType = publicKernelRequest.type;
    }

    if (this.publicFunctions.length > 0) {
      // The first merge kernel takes the tube proof.
      const firstKernelIndex = this.publicFunctions.findIndex(
        fn => fn.publicKernelRequest.type === ProvingRequestType.PUBLIC_KERNEL_MERGE,
      );
      this.publicFunctions[firstKernelIndex].previousProofType = ProvingRequestType.TUBE_PROOF;
    }
  }

  // Updates the transaction's proving state after completion of a kernel proof
  // Returns an instruction as to the next stage of tx proving
  public getNextPublicKernelFromKernelProof(
    provenIndex: number,
    proof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>,
    verificationKey: VerificationKeyData,
  ): TxProvingInstruction {
    const kernelRequest = this.getPublicFunctionState(provenIndex).publicKernelRequest;
    const provenIsInner = kernelRequest.type === ProvingRequestType.PUBLIC_KERNEL_INNER;
    // If the proven request is not an inner kernel, its next kernel should not be an inner kernel either.
    const nextFunctionIndex = provenIsInner
      ? provenIndex + 1
      : this.publicFunctions.findIndex(
          (fn, i) => i > provenIndex && fn.publicKernelRequest.type !== ProvingRequestType.PUBLIC_KERNEL_INNER,
        );
    if (nextFunctionIndex >= this.publicFunctions.length || nextFunctionIndex === -1) {
      // The next kernel index is greater than our set of functions, we are done!
      return { code: TX_PROVING_CODE.COMPLETED, function: undefined };
    }

    // There is more work to do, are we ready?
    const nextFunction = this.publicFunctions[nextFunctionIndex];

    if (provenIsInner && nextFunction.publicKernelRequest.type !== ProvingRequestType.PUBLIC_KERNEL_INNER) {
      // TODO(#7124): Remove this temporary hack.
      // If the proven request is inner (with vm proof) and the next one is regular kernel, set the vmProof to be
      // not undefined.
      // This should eventually be a real vm proof of the entire enqueued call.
      nextFunction.vmProof = makeEmptyProof();
    } else {
      // pass both the proof and verification key forward to the next circuit
      nextFunction.publicKernelRequest.inputs.previousKernel.proof = proof;
      nextFunction.publicKernelRequest.inputs.previousKernel.vk = verificationKey;

      // We need to update this so the state machine knows this proof is ready
      nextFunction.previousKernelProven = true;
      nextFunction.previousProofType = kernelRequest.type;
    }

    if (nextFunction.vmProof === undefined || !nextFunction.previousKernelProven) {
      // The VM proof for the next function is not ready
      return { code: TX_PROVING_CODE.NOT_READY, function: undefined };
    }

    // The VM proof is ready, we can continue
    return { code: TX_PROVING_CODE.READY, function: nextFunction, functionIndex: nextFunctionIndex };
  }

  // Updates the transaction's proving state after completion of a tube proof
  // Returns an instruction as to the next stage of tx proving
  public getNextPublicKernelFromTubeProof(
    proof: RecursiveProof<typeof RECURSIVE_PROOF_LENGTH>,
    verificationKey: VerificationKeyData,
  ): TxProvingInstruction {
    const nextFunctionIndex = this.publicFunctions.findIndex(
      (fn, i) => i > 0 && fn.previousProofType === ProvingRequestType.TUBE_PROOF,
    );
    if (nextFunctionIndex === -1) {
      // There are no public functions to be processed, we are done!
      return { code: TX_PROVING_CODE.COMPLETED, function: undefined };
    }

    // There is more work to do, are we ready?
    const nextFunction = this.publicFunctions[nextFunctionIndex];

    // pass both the proof and verification key forward to the next circuit
    nextFunction.publicKernelRequest.inputs.previousKernel.proof = proof;
    nextFunction.publicKernelRequest.inputs.previousKernel.vk = verificationKey;

    // We need to update this so the state machine knows this proof is ready
    nextFunction.previousKernelProven = true;
    if (nextFunction.vmProof === undefined) {
      // The VM proof for the next function is not ready
      return { code: TX_PROVING_CODE.NOT_READY, function: undefined };
    }

    // The VM proof is ready, we can continue
    return { code: TX_PROVING_CODE.READY, function: nextFunction, functionIndex: nextFunctionIndex };
  }

  // Updates the transaction's proving state after completion of a VM proof
  // Returns an instruction as to the next stage of tx proving
  public getNextPublicKernelFromVMProof(provenIndex: number, proof: Proof): TxProvingInstruction {
    const provenFunction = this.publicFunctions[provenIndex];
    provenFunction.vmProof = proof;

    if (!provenFunction.previousKernelProven) {
      // The previous kernel is not yet ready
      return { code: TX_PROVING_CODE.NOT_READY, function: undefined };
    }
    // The previous kernel is ready so we can prove this kernel
    return { code: TX_PROVING_CODE.READY, function: provenFunction, functionIndex: provenIndex };
  }

  // Returns the public function state at the given index
  // Throws if out of bounds
  public getPublicFunctionState(functionIndex: number) {
    if (functionIndex < 0 || functionIndex >= this.publicFunctions.length) {
      throw new Error(`Requested public function index was out of bounds`);
    }
    return this.publicFunctions[functionIndex];
  }

  // Returns the number of public kernels required by this transaction
  public getNumPublicKernels() {
    return this.publicFunctions.length;
  }
}
