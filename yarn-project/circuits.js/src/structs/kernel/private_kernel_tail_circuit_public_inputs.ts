import { BufferReader } from '@aztec/foundation/serialize';

import { MAX_NEW_NULLIFIERS_PER_TX } from '../../constants.gen.js';
import { countAccumulatedItems, mergeAccumulatedData } from '../../utils/index.js';
import { AggregationObject } from '../aggregation_object.js';
import { ValidationRequests } from '../validation_requests.js';
import { CombinedConstantData } from './combined_constant_data.js';
import { KernelCircuitPublicInputs } from './kernel_circuit_public_inputs.js';
import { PublicAccumulatedData } from './public_accumulated_data.js';
import { PublicKernelCircuitPublicInputs } from './public_kernel_circuit_public_inputs.js';

/**
 * Private tail kernel can output Outputs from the public kernel circuits.
 * All Public kernels use this shape for outputs.
 */
export class PrivateKernelTailCircuitPublicInputs extends PublicKernelCircuitPublicInputs {
  numberOfPublicCallRequests() {
    return (
      countAccumulatedItems(this.endNonRevertibleData.publicCallStack) + countAccumulatedItems(this.end.publicCallStack)
    );
  }

  static fromKernelCircuitPublicInputs() {}

  toKernelCircuitPublicInputs() {
    return new KernelCircuitPublicInputs(this.aggregationObject, this.end, this.constants, this.reverted);
  }

  getNonEmptyNullifiers() {
    return mergeAccumulatedData(
      MAX_NEW_NULLIFIERS_PER_TX,
      this.endNonRevertibleData.newNullifiers,
      this.end.newNullifiers,
    ).filter(n => !n.isEmpty());
  }

  static fromBuffer(buffer: Buffer | BufferReader): PrivateKernelTailCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateKernelTailCircuitPublicInputs(
      reader.readObject(AggregationObject),
      reader.readObject(ValidationRequests),
      reader.readObject(PublicAccumulatedData),
      reader.readObject(PublicAccumulatedData),
      reader.readObject(CombinedConstantData),
      reader.readBoolean(),
    );
  }

  static empty() {
    return new PrivateKernelTailCircuitPublicInputs(
      AggregationObject.makeFake(),
      ValidationRequests.empty(),
      PublicAccumulatedData.empty(),
      PublicAccumulatedData.empty(),
      CombinedConstantData.empty(),
      false,
    );
  }
}
