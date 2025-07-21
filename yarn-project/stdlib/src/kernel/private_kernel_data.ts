import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { VkData } from '../vks/index.js';
import { PrivateKernelCircuitPublicInputs } from './private_kernel_circuit_public_inputs.js';

/**
 * Data of the previous kernel iteration in the chain of kernels.
 */
export class PrivateKernelData {
  // NOTE: as of move to honk and client IVC, previous private kernels no longer come with their proof
  // as we do client IVC not recursive verification. We need to ensure the public inputs here is properly constrained, TODO(https://github.com/AztecProtocol/barretenberg/issues/1048)
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
