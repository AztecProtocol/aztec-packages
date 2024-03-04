import { serializeToBuffer } from '@aztec/foundation/serialize';

import { PublicKernelData } from './public_kernel_data.js';

/**
 * Inputs to the public kernel circuit.
 */
export class PublicKernelTailCircuitPrivateInputs {
  constructor(
    /**
     * Kernels are recursive and this is the data from the previous kernel.
     */
    public readonly previousKernel: PublicKernelData,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.previousKernel);
  }
}
