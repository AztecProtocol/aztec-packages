import { GeneratorIndex, PRIVATE_TO_PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { type Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { type FieldsOf } from '@aztec/foundation/types';

import { AztecAddress } from '../aztec-address/index.js';
import { Gas } from '../gas/gas.js';
import { TxConstantData } from '../tx/tx_constant_data.js';
import { RollupValidationRequests } from './hints/rollup_validation_requests.js';
import { PrivateToPublicAccumulatedData } from './private_to_public_accumulated_data.js';
import { PublicCallRequest } from './public_call_request.js';

export class PrivateToPublicKernelCircuitPublicInputs {
  constructor(
    public constants: TxConstantData,
    public rollupValidationRequests: RollupValidationRequests,
    public nonRevertibleAccumulatedData: PrivateToPublicAccumulatedData,
    public revertibleAccumulatedData: PrivateToPublicAccumulatedData,
    public publicTeardownCallRequest: PublicCallRequest,
    public gasUsed: Gas,
    public feePayer: AztecAddress,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.constants,
      this.rollupValidationRequests,
      this.nonRevertibleAccumulatedData,
      this.revertibleAccumulatedData,
      this.publicTeardownCallRequest,
      this.gasUsed,
      this.feePayer,
    );
  }

  static getFields(fields: FieldsOf<PrivateToPublicKernelCircuitPublicInputs>) {
    return [
      fields.constants,
      fields.rollupValidationRequests,
      fields.nonRevertibleAccumulatedData,
      fields.revertibleAccumulatedData,
      fields.publicTeardownCallRequest,
      fields.gasUsed,
      fields.feePayer,
    ] as const;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PrivateToPublicKernelCircuitPublicInputs(
      reader.readObject(TxConstantData),
      reader.readObject(RollupValidationRequests),
      reader.readObject(PrivateToPublicAccumulatedData),
      reader.readObject(PrivateToPublicAccumulatedData),
      reader.readObject(PublicCallRequest),
      reader.readObject(Gas),
      reader.readObject(AztecAddress),
    );
  }

  static empty() {
    return new PrivateToPublicKernelCircuitPublicInputs(
      TxConstantData.empty(),
      RollupValidationRequests.empty(),
      PrivateToPublicAccumulatedData.empty(),
      PrivateToPublicAccumulatedData.empty(),
      PublicCallRequest.empty(),
      Gas.empty(),
      AztecAddress.ZERO,
    );
  }

  static fromString(str: string) {
    return PrivateToPublicKernelCircuitPublicInputs.fromBuffer(hexToBuffer(str));
  }

  toString() {
    return bufferToHex(this.toBuffer());
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...PrivateToPublicKernelCircuitPublicInputs.getFields(this));
    if (fields.length !== PRIVATE_TO_PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH) {
      throw new Error(
        `Invalid number of fields for PrivateToPublicKernelCircuitPublicInputs. Expected ${PRIVATE_TO_PUBLIC_KERNEL_CIRCUIT_PUBLIC_INPUTS_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  hash() {
    return poseidon2HashWithSeparator(this.toFields(), GeneratorIndex.PUBLIC_TX_HASH);
  }
}
