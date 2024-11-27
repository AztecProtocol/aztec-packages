import { AztecAddress } from '@aztec/foundation/aztec-address';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { Gas } from '../gas.js';
import { PublicCallRequest } from '../public_call_request.js';
import { RollupValidationRequests } from '../rollup_validation_requests.js';
import { PrivateToPublicAccumulatedData } from './private_to_public_accumulated_data.js';
import { TxConstantData } from './tx_constant_data.js';

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
}
