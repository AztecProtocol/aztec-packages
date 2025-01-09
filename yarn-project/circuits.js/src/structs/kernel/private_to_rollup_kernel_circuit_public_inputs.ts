import { AztecAddress } from '@aztec/foundation/aztec-address';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { type Fr } from '@aztec/foundation/fields';
import { bufferSchemaFor } from '@aztec/foundation/schemas';
import { BufferReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import { GeneratorIndex, PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH } from '../../constants.gen.js';
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
     * Data which is not modified by the circuits.
     */
    public constants: TxConstantData,
    /**
     * Validation requests accumulated from private and public execution to be completed by the rollup.
     */
    public rollupValidationRequests: RollupValidationRequests,
    /**
     * Data accumulated from both public and private circuits.
     */
    public end: PrivateToRollupAccumulatedData,
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
    return serializeToBuffer(this.constants, this.rollupValidationRequests, this.end, this.gasUsed, this.feePayer);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of PrivateToRollupKernelCircuitPublicInputs.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PrivateToRollupKernelCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new PrivateToRollupKernelCircuitPublicInputs(
      reader.readObject(TxConstantData),
      reader.readObject(RollupValidationRequests),
      reader.readObject(PrivateToRollupAccumulatedData),
      reader.readObject(Gas),
      reader.readObject(AztecAddress),
    );
  }

  static empty() {
    return new PrivateToRollupKernelCircuitPublicInputs(
      TxConstantData.empty(),
      RollupValidationRequests.empty(),
      PrivateToRollupAccumulatedData.empty(),
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

  static getFields(fields: FieldsOf<PrivateToRollupKernelCircuitPublicInputs>) {
    return [fields.constants, fields.rollupValidationRequests, fields.end, fields.gasUsed, fields.feePayer] as const;
  }

  /** Creates an instance from a hex string. */
  static get schema() {
    return bufferSchemaFor(PrivateToRollupKernelCircuitPublicInputs);
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...PrivateToRollupKernelCircuitPublicInputs.getFields(this));
    if (fields.length !== PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH) {
      throw new Error(
        `Invalid number of fields for PrivateToRollupKernelCircuitPublicInputs. Expected ${PRIVATE_TO_ROLLUP_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  hash() {
    return poseidon2HashWithSeparator(this.toFields(), GeneratorIndex.PRIVATE_TX_HASH);
  }
}
