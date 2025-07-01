import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { PaddedSideEffectAmounts } from './padded_side_effects.js';
import { PrivateKernelData } from './private_kernel_data.js';

/**
 * Input to the private kernel circuit - tail call.
 */
export class PrivateKernelTailCircuitPrivateInputs {
  constructor(
    /**
     * The previous kernel data
     */
    public previousKernel: PrivateKernelData,
    /**
     * The number of the padded side effects.
     */
    public paddedSideEffectAmounts: PaddedSideEffectAmounts,
  ) {}

  isForPublic() {
    return (
      this.previousKernel.publicInputs.end.publicCallRequests.claimedLength > 0 ||
      !this.previousKernel.publicInputs.publicTeardownCallRequest.isEmpty()
    );
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.previousKernel, this.paddedSideEffectAmounts);
  }

  /**
   * Deserializes from a buffer or reader.
   * @param buffer - Buffer or reader to read from.
   * @returns The deserialized instance.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelTailCircuitPrivateInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelTailCircuitPrivateInputs(
      reader.readObject(PrivateKernelData),
      reader.readObject(PaddedSideEffectAmounts),
    );
  }
}
