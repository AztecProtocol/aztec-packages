import { AztecAddress } from '@aztec/foundation/aztec-address';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { Gas } from '../gas.js';
import { PartialStateReference } from '../partial_state_reference.js';
import { RevertCode } from '../revert_code.js';
import { RollupValidationRequests } from '../rollup_validation_requests.js';
import { CombinedAccumulatedData } from './combined_accumulated_data.js';
import { CombinedConstantData } from './combined_constant_data.js';

/**
 * Outputs from the public kernel circuits.
 * All Public kernels use this shape for outputs.
 */
export class KernelCircuitPublicInputs {
  constructor(
    /**
     * Validation requests accumulated from private and public execution to be completed by the rollup.
     */
    public rollupValidationRequests: RollupValidationRequests,
    /**
     * Data accumulated from both public and private circuits.
     */
    public end: CombinedAccumulatedData,
    /**
     * Data which is not modified by the circuits.
     */
    public constants: CombinedConstantData,
    public startState: PartialStateReference,
    /**
     * Flag indicating whether the transaction reverted.
     */
    public revertCode: RevertCode,
    /**
     * Gas used during this transaction
     */
    public gasUsed: Gas,
    /**
     * The address of the fee payer for the transaction.
     */
    public feePayer: AztecAddress,
  ) {}

  getNonEmptyNullifiers() {
    return this.end.nullifiers.filter(n => !n.isZero());
  }

  toBuffer() {
    return serializeToBuffer(
      this.rollupValidationRequests,
      this.end,
      this.constants,
      this.startState,
      this.revertCode,
      this.gasUsed,
      this.feePayer,
    );
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of KernelCircuitPublicInputs.
   */
  static fromBuffer(buffer: Buffer | BufferReader): KernelCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new KernelCircuitPublicInputs(
      reader.readObject(RollupValidationRequests),
      reader.readObject(CombinedAccumulatedData),
      reader.readObject(CombinedConstantData),
      reader.readObject(PartialStateReference),
      reader.readObject(RevertCode),
      reader.readObject(Gas),
      reader.readObject(AztecAddress),
    );
  }

  static empty() {
    return new KernelCircuitPublicInputs(
      RollupValidationRequests.empty(),
      CombinedAccumulatedData.empty(),
      CombinedConstantData.empty(),
      PartialStateReference.empty(),
      RevertCode.OK,
      Gas.empty(),
      AztecAddress.ZERO,
    );
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return KernelCircuitPublicInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a hex representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(KernelCircuitPublicInputs);
  }
}
