import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { PublicCallData } from './public_call_data.js';
import { PublicKernelInnerData } from './public_kernel_inner_data.js';

/**
 * Inputs to the public kernel circuit.
 */
export class PublicKernelInnerCircuitPrivateInputs {
  constructor(
    /**
     * Kernels are recursive and this is the data from the previous kernel.
     */
    public readonly previousKernel: PublicKernelInnerData,
    /**
     * Public calldata assembled from the execution result and proof.
     */
    public readonly publicCall: PublicCallData,
  ) {}

  /**
   * Serializes the object to a buffer.
   * @returns - Buffer representation of the object.
   */
  toBuffer() {
    return serializeToBuffer(this.previousKernel, this.publicCall);
  }

  /**
   * Serializes the object to a hex string.
   * @returns - Hex string representation of the object.
   */
  toString() {
    return this.toBuffer().toString('hex');
  }

  /**
   * Deserializes the object from a buffer.
   * @param buffer - Buffer to deserialize.
   * @returns - Deserialized object.
   */
  static fromBuffer(buffer: BufferReader | Buffer) {
    const reader = BufferReader.asReader(buffer);
    const previousKernel = reader.readObject(PublicKernelInnerData);
    const publicCall = reader.readObject(PublicCallData);
    return new PublicKernelInnerCircuitPrivateInputs(previousKernel, publicCall);
  }

  /**
   * Deserializes the object from a hex string.
   * @param str - Hex string to deserialize.
   * @returns - Deserialized object.
   */
  static fromString(str: string) {
    return PublicKernelInnerCircuitPrivateInputs.fromBuffer(Buffer.from(str, 'hex'));
  }

  /**
   * Clones the object.
   * @returns - Cloned object.
   */
  clone() {
    return PublicKernelInnerCircuitPrivateInputs.fromBuffer(this.toBuffer());
  }
}
