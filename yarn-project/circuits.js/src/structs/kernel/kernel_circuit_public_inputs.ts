import { AztecAddress } from '@aztec/foundation/aztec-address';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { Gas } from '../gas.js';
import { RollupValidationRequests } from '../rollup_validation_requests.js';
import { PrivateToRollupAccumulatedData } from './private_to_rollup_accumulated_data.js';
import { TxConstantData } from './tx_constant_data.js';

/**
 * Outputs from the public kernel circuits.
 * All Public kernels use this shape for outputs.
 */
export class PrivateToRollupKernelCircuitPublicInputs {
  constructor(
    /**
     * Validation requests accumulated from private and public execution to be completed by the rollup.
     */
    public rollupValidationRequests: RollupValidationRequests,
    /**
     * Data accumulated from both public and private circuits.
     */
    public end: PrivateToRollupAccumulatedData,
    /**
     * Data which is not modified by the circuits.
     */
    public constants: TxConstantData,
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
    return serializeToBuffer(this.rollupValidationRequests, this.end, this.constants, this.gasUsed, this.feePayer);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of PrivateToRollupKernelCircuitPublicInputs.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateToRollupKernelCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateToRollupKernelCircuitPublicInputs(
      reader.readObject(RollupValidationRequests),
      reader.readObject(PrivateToRollupAccumulatedData),
      reader.readObject(TxConstantData),
      reader.readObject(Gas),
      reader.readObject(AztecAddress),
    );
  }

  static empty() {
    return new PrivateToRollupKernelCircuitPublicInputs(
      RollupValidationRequests.empty(),
      PrivateToRollupAccumulatedData.empty(),
      TxConstantData.empty(),
      Gas.empty(),
      AztecAddress.ZERO,
    );
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  static fromString(str: string) {
    return PrivateToRollupKernelCircuitPublicInputs.fromBuffer(hexToBuffer(str));
  }

  /** Returns a hex representation for JSON serialization. */
  toJSON() {
    return this.toBuffer();
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(PrivateToRollupKernelCircuitPublicInputs);
  }
}
