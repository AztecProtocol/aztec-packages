import type {
  MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_NULLIFIER_READ_REQUESTS_PER_TX,
} from '@aztec/constants';
import { bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';

import type { UInt64 } from '../types/shared.js';
import type { PrivateKernelResetHints } from './hints/private_kernel_reset_hints.js';
import type { PaddedSideEffectAmounts, PaddedSideEffects } from './padded_side_effects.js';
import { kernelStateIsForPublic } from './private_kernel_circuit_public_inputs.js';
import type { PrivateKernelData } from './private_kernel_data.js';
import { PrivateKernelResetCircuitPrivateInputsVariants } from './private_kernel_reset_circuit_private_inputs.js';
import type { PrivateKernelResetDimensions } from './private_kernel_reset_dimensions.js';

/**
 * Input to a terminal reset+tail circuit. `isForPublic()` selects the rollup-bound (`reset_tail`)
 * or public-bound (`reset_tail_to_public`) family.
 */
export class PrivateKernelResetTailCircuitPrivateInputs {
  constructor(
    public previousKernel: PrivateKernelData,
    public paddedSideEffects: PaddedSideEffects,
    public hints: PrivateKernelResetHints<
      typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
      typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
      typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      typeof MAX_KEY_VALIDATION_REQUESTS_PER_TX,
      typeof MAX_NULLIFIERS_PER_TX
    >,
    public dimensions: PrivateKernelResetDimensions,
    public paddedSideEffectAmounts: PaddedSideEffectAmounts,
    public expirationTimestampUpperBound: UInt64,
  ) {}

  isForPublic() {
    return kernelStateIsForPublic(this.previousKernel.publicInputs);
  }

  /**
   * Returns a dimension-trimmed view of the reset portion of these inputs (without the tail
   * fields). The prover uses this to feed witness generation of the variant matching the chosen
   * dimensions.
   */
  trimResetToSizes() {
    const hints = this.hints.trimToSizes(
      this.dimensions.NOTE_HASH_PENDING_READ,
      this.dimensions.NOTE_HASH_SETTLED_READ,
      this.dimensions.NULLIFIER_PENDING_READ,
      this.dimensions.NULLIFIER_SETTLED_READ,
      this.dimensions.KEY_VALIDATION,
      this.dimensions.TRANSIENT_DATA_SQUASHING,
    );
    return new PrivateKernelResetCircuitPrivateInputsVariants(this.previousKernel, this.paddedSideEffects, hints);
  }

  toBuffer() {
    return serializeToBuffer(
      this.previousKernel,
      this.paddedSideEffects,
      this.hints,
      this.dimensions,
      this.paddedSideEffectAmounts,
      bigintToUInt64BE(this.expirationTimestampUpperBound),
    );
  }
}
