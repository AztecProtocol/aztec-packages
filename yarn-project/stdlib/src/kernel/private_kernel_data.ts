import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { VkData } from '../vks/index.js';
import { PrivateKernelCircuitPublicInputs } from './private_kernel_circuit_public_inputs.js';

/**
 * Data of the previous kernel iteration in the chain of kernels.
 */
export class PrivateKernelData {
  constructor(
    /**
     * Public inputs of the previous kernel.
     */
    public publicInputs: PrivateKernelCircuitPublicInputs,
    /**
     * The verification key and the witness of the vk in the vk tree.
     */
    public vkData: VkData,
  ) {}

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.publicInputs, this.vkData);
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelData {
    const reader = BufferReader.asReader(buffer);
    return new this(reader.readObject(PrivateKernelCircuitPublicInputs), reader.readObject(VkData));
  }

  static empty(): PrivateKernelData {
    return new PrivateKernelData(PrivateKernelCircuitPublicInputs.empty(), VkData.empty());
  }
}
