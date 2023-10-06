import { Fr } from '@aztec/foundation/fields';
import { Tuple } from '@aztec/foundation/serialize';

import { MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL } from '../../cbind/constants.gen.js';
import { serializeToBuffer } from '../../utils/serialize.js';
import { PublicCallStackItem } from '../call_stack_item.js';
import { Proof } from '../proof.js';
import { PreviousPrivateKernelDataFinal, PreviousPublicKernelData } from './previous_kernel_data.js';

/**
 * Inputs to the public init kernel circuit init (first iteration).
 */
export class PublicKernelInputsInit {
  constructor(
    /**
     * Kernels are recursive and this is the data from the previous kernel.
     */
    public readonly previousKernel: PreviousPrivateKernelDataFinal,
    /**
     * Public calldata assembled from the execution result and proof.
     */
    public readonly publicCall: PublicCallData,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.previousKernel, this.publicCall);
  }
}

/**
 * Inputs to the public inner kernel circuit (subsequent iteration).
 */
export class PublicKernelInputsInner {
  constructor(
    /**
     * Kernels are recursive and this is the data from the previous kernel.
     */
    public readonly previousKernel: PreviousPublicKernelData,
    /**
     * Public calldata assembled from the execution result and proof.
     */
    public readonly publicCall: PublicCallData,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.previousKernel, this.publicCall);
  }
}

/**
 * Public calldata assembled from the kernel execution result and proof.
 */
export class PublicCallData {
  constructor(
    /**
     * Call stack item being processed by the current iteration of the kernel.
     */
    public readonly callStackItem: PublicCallStackItem,
    /**
     * Children call stack items.
     */
    public readonly publicCallStackPreimages: Tuple<PublicCallStackItem, typeof MAX_PUBLIC_CALL_STACK_LENGTH_PER_CALL>,
    /**
     * Proof of the call stack item execution.
     */
    public readonly proof: Proof,
    /**
     * Address of the corresponding portal contract.
     */
    public readonly portalContractAddress: Fr,
    /**
     * Hash of the L2 contract bytecode.
     */
    public readonly bytecodeHash: Fr,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.callStackItem,
      this.publicCallStackPreimages,
      this.proof,
      this.portalContractAddress,
      this.bytecodeHash,
    );
  }
}
