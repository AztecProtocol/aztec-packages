import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { EnqueuedCallData } from './enqueued_call_data.js';
import { PublicKernelData } from './public_kernel_data.js';

/**
 * Inputs to the public kernel circuit.
 */
export class PublicKernelCircuitPrivateInputs {
  constructor(
    /**
     * Kernels are recursive and this is the data from the previous kernel.
     */
    public readonly previousKernel: PublicKernelData,
    /**
     * Public calldata assembled from the execution result and proof.
     */
    public readonly enqueuedCall: EnqueuedCallData,
  ) {}

  /**
   * Serializes the object to a buffer.
   * @returns - Buffer representation of the object.
   */
  toBuffer() {
    return serializeToBuffer(this.previousKernel, this.enqueuedCall);
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
    const previousKernel = reader.readObject(PublicKernelData);
    const enqueuedCall = reader.readObject(EnqueuedCallData);
    return new PublicKernelCircuitPrivateInputs(previousKernel, enqueuedCall);
  }

  /**
   * Deserializes the object from a hex string.
   * @param str - Hex string to deserialize.
   * @returns - Deserialized object.
   */
  static fromString(str: string) {
    return PublicKernelCircuitPrivateInputs.fromBuffer(Buffer.from(str, 'hex'));
  }

  /**
   * Clones the object.
   * @returns - Cloned object.
   */
  clone() {
    return PublicKernelCircuitPrivateInputs.fromBuffer(this.toBuffer());
  }
}
