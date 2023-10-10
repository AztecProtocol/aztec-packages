import { BufferReader } from '@aztec/foundation/serialize';

import { serializeToBuffer } from '../../utils/serialize.js';
import { PrivateAccumulatedData, PublicAccumulatedData } from './combined_accumulated_data.js';
import { CombinedConstantData } from './combined_constant_data.js';

/**
 * Public inputs of the public kernel circuit.
 * @see circuits/cpp/src/aztec3/circuits/abis/public_kernel_public_inputs.hpp
 */
export class PublicKernelPublicInputs {
  constructor(
    /**
     * Data accumulated from both public and private circuits.
     */
    public end: PublicAccumulatedData,
    /**
     * Data which is not modified by the circuits.
     */
    public constants: CombinedConstantData,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.end, this.constants);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of KernelCircuitPublicInputs.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PublicKernelPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new PublicKernelPublicInputs(
      reader.readObject(PublicAccumulatedData),
      reader.readObject(CombinedConstantData),
    );
  }

  static empty() {
    return new PublicKernelPublicInputs(PublicAccumulatedData.empty(), CombinedConstantData.empty());
  }
}

/**
 * Public inputs of the private kernel circuit.
 */
/**
 * Public inputs of the private kernel circuit.
 * @see circuits/cpp/src/aztec3/circuits/abis/private_kernel_public_inputs.hpp
 */
export class PrivateKernelPublicInputs {
  constructor(
    /**
     * Data accumulated from private circuits.
     */
    public end: PrivateAccumulatedData,
    /**
     * Data which is not modified by the circuits.
     */
    public constants: CombinedConstantData,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.end, this.constants);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of PrivateKernelPublicInputs.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelPublicInputs(
      reader.readObject(PrivateAccumulatedData),
      reader.readObject(CombinedConstantData),
    );
  }

  static empty() {
    return new PrivateKernelPublicInputs(PrivateAccumulatedData.empty(), CombinedConstantData.empty());
  }
}
