import { BufferReader } from '@aztec/foundation/serialize';

import { serializeToBuffer } from '../../utils/serialize.js';
import { PrivateAccumulatedDataFinal } from './combined_accumulated_data.js';
import { CombinedConstantData } from './combined_constant_data.js';

/**
 * Public inputs of the final ordering private kernel circuit.
 * @see circuits/cpp/src/aztec3/circuits/abis/private_kernel_public_inputs_final.hpp
 */
export class PrivateKernelPublicInputsFinal {
  constructor(
    /**
     * Final data accumulated for ordering private kernel circuit.
     */
    public end: PrivateAccumulatedDataFinal,
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
   * @returns A new instance of KernelCircuitPublicInputsFinal.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelPublicInputsFinal {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelPublicInputsFinal(
      reader.readObject(PrivateAccumulatedDataFinal),
      reader.readObject(CombinedConstantData),
    );
  }

  static empty() {
    return new PrivateKernelPublicInputsFinal(PrivateAccumulatedDataFinal.empty(), CombinedConstantData.empty());
  }
}
