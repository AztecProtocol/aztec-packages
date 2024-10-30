import { serializeToBuffer } from '@aztec/foundation/serialize';

import {
  type MAX_KEY_VALIDATION_REQUESTS_PER_TX,
  type MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
  type MAX_NULLIFIERS_PER_TX,
  type MAX_NULLIFIER_READ_REQUESTS_PER_TX,
} from '../../constants.gen.js';
import { type PrivateKernelData } from './private_kernel_data.js';
import { type PrivateKernelResetDimensions } from './private_kernel_reset_dimensions.js';
import { type PrivateKernelResetHints } from './private_kernel_reset_hints.js';

export class PrivateKernelResetCircuitPrivateInputsVariants<
  NH_RR_PENDING extends number,
  NH_RR_SETTLED extends number,
  NLL_RR_PENDING extends number,
  NLL_RR_SETTLED extends number,
  KEY_VALIDATION_REQUESTS extends number,
  NUM_TRANSIENT_DATA_INDEX_HINTS extends number,
> {
  constructor(
    public previousKernel: PrivateKernelData,
    public hints: PrivateKernelResetHints<
      NH_RR_PENDING,
      NH_RR_SETTLED,
      NLL_RR_PENDING,
      NLL_RR_SETTLED,
      KEY_VALIDATION_REQUESTS,
      NUM_TRANSIENT_DATA_INDEX_HINTS
    >,
  ) {}

  toBuffer() {
    return serializeToBuffer(this.previousKernel, this.hints);
  }
}

/**
 * Input to the private kernel circuit - reset call.
 */
export class PrivateKernelResetCircuitPrivateInputs {
  constructor(
    /**
     * The previous kernel data
     */
    public previousKernel: PrivateKernelData,
    public hints: PrivateKernelResetHints<
      typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
      typeof MAX_NOTE_HASH_READ_REQUESTS_PER_TX,
      typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      typeof MAX_NULLIFIER_READ_REQUESTS_PER_TX,
      typeof MAX_KEY_VALIDATION_REQUESTS_PER_TX,
      typeof MAX_NULLIFIERS_PER_TX
    >,
    public dimensions: PrivateKernelResetDimensions,
  ) {}

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.previousKernel, this.hints, this.dimensions);
  }

  trimToSizes() {
    const hints = this.hints.trimToSizes(
      this.dimensions.NOTE_HASH_PENDING_AMOUNT,
      this.dimensions.NOTE_HASH_SETTLED_AMOUNT,
      this.dimensions.NULLIFIER_PENDING_AMOUNT,
      this.dimensions.NULLIFIER_SETTLED_AMOUNT,
      this.dimensions.NULLIFIER_KEYS,
      this.dimensions.TRANSIENT_DATA_AMOUNT,
    );
    return new PrivateKernelResetCircuitPrivateInputsVariants(this.previousKernel, hints);
  }
}
