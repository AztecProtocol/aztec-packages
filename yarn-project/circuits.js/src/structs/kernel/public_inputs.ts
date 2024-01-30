import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { AggregationObject } from '../aggregation_object.js';
import { CombinedAccumulatedData } from './combined_accumulated_data.js';
import { CombinedConstantData } from './combined_constant_data.js';

/**
 * Public inputs of the public and private kernel circuits.
 */
export class KernelCircuitPublicInputs {
  constructor(
    /**
     * Aggregated proof of all the previous kernel iterations.
     */
    public aggregationObject: AggregationObject, // Contains the aggregated proof of all previous kernel iterations

    /**
     * Final data accumulated for ordering private kernel circuit for fee prep phase
     */
    public endFeePrep: CombinedAccumulatedData,

    /**
     * Final data accumulated for ordering private kernel circuit for app logic phase
     */
    public endAppLogic: CombinedAccumulatedData,

    /**
     * Data which is not modified by the circuits.
     */
    public constants: CombinedConstantData,

    /**
     * Indicates whether the input is for a private or public kernel.
     */
    public isPrivate: boolean,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.aggregationObject, this.endFeePrep, this.endAppLogic, this.constants, this.isPrivate);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of KernelCircuitPublicInputs.
   */
  static fromBuffer(buffer: Buffer | BufferReader): KernelCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new KernelCircuitPublicInputs(
      reader.readObject(AggregationObject),
      reader.readObject(CombinedAccumulatedData),
      reader.readObject(CombinedAccumulatedData),
      reader.readObject(CombinedConstantData),
      reader.readBoolean(),
    );
  }

  static empty() {
    return new KernelCircuitPublicInputs(
      AggregationObject.makeFake(),
      CombinedAccumulatedData.empty(),
      CombinedAccumulatedData.empty(),
      CombinedConstantData.empty(),
      true,
    );
  }
}

/**
 * Public inputs of the public kernel circuit.
 */
export class PublicKernelPublicInputs extends KernelCircuitPublicInputs {
  constructor(
    aggregationObject: AggregationObject,
    endAppLogic: CombinedAccumulatedData,
    endFeePrep: CombinedAccumulatedData,
    constants: CombinedConstantData,
  ) {
    super(aggregationObject, endFeePrep, endAppLogic, constants, false);
  }

  static empty(): PublicKernelPublicInputs {
    return new PublicKernelPublicInputs(
      AggregationObject.makeFake(),
      CombinedAccumulatedData.empty(),
      CombinedAccumulatedData.empty(),
      CombinedConstantData.empty(),
    );
  }
}

/**
 * Public inputs of the private kernel circuit.
 */
export class PrivateKernelPublicInputs extends KernelCircuitPublicInputs {
  constructor(
    aggregationObject: AggregationObject,
    endFeePrep: CombinedAccumulatedData,
    endAppLogic: CombinedAccumulatedData,
    constants: CombinedConstantData,
  ) {
    super(aggregationObject, endFeePrep, endAppLogic, constants, true);
  }

  static empty(): PrivateKernelPublicInputs {
    return new PrivateKernelPublicInputs(
      AggregationObject.makeFake(),
      CombinedAccumulatedData.empty(),
      CombinedAccumulatedData.empty(),
      CombinedConstantData.empty(),
    );
  }
}
