import { AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import { PublicCallRequest } from '../public_call_request.js';
import { PublicValidationRequests } from '../public_validation_requests.js';
import { RevertCode } from '../revert_code.js';
import { CombinedConstantData } from './combined_constant_data.js';
import { PublicAccumulatedData } from './public_accumulated_data.js';

/**
 * Outputs from the public kernel circuits.
 * All Public kernels use this shape for outputs.
 */
export class PublicKernelCircuitPublicInputs {
  constructor(
    /**
     * Data which is not modified by the circuits.
     */
    public constants: CombinedConstantData,
    /**
     * Validation requests accumulated from public functions.
     */
    public validationRequests: PublicValidationRequests,
    /**
     * Accumulated side effects and enqueued calls that are not revertible.
     */
    public endNonRevertibleData: PublicAccumulatedData,
    /**
     * Data accumulated from both public and private circuits.
     */
    public end: PublicAccumulatedData,
    /**
     * Counter of the last side effect.
     */
    public endSideEffectCounter: number,
    /**
     * The call request for the public teardown function
     */
    public publicTeardownCallRequest: PublicCallRequest,
    /**
     * The address of the fee payer for the transaction
     */
    public feePayer: AztecAddress,
    /**
     * Indicates whether execution of the public circuit reverted.
     */
    public revertCode: RevertCode,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.constants,
      this.validationRequests,
      this.endNonRevertibleData,
      this.end,
      this.endSideEffectCounter,
      this.publicTeardownCallRequest,
      this.feePayer,
      this.revertCode,
    );
  }

  clone() {
    return PublicKernelCircuitPublicInputs.fromBuffer(this.toBuffer());
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  static fromString(str: string) {
    return PublicKernelCircuitPublicInputs.fromBuffer(Buffer.from(str, 'hex'));
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer or reader to read from.
   * @returns A new instance of PublicKernelCircuitPublicInputs.
   */
  static fromBuffer(buffer: Buffer | BufferReader): PublicKernelCircuitPublicInputs {
    const reader = BufferReader.asReader(buffer);
    return new PublicKernelCircuitPublicInputs(
      reader.readObject(CombinedConstantData),
      reader.readObject(PublicValidationRequests),
      reader.readObject(PublicAccumulatedData),
      reader.readObject(PublicAccumulatedData),
      reader.readNumber(),
      reader.readObject(PublicCallRequest),
      reader.readObject(AztecAddress),
      reader.readObject(RevertCode),
    );
  }

  static empty() {
    return new PublicKernelCircuitPublicInputs(
      CombinedConstantData.empty(),
      PublicValidationRequests.empty(),
      PublicAccumulatedData.empty(),
      PublicAccumulatedData.empty(),
      0,
      PublicCallRequest.empty(),
      AztecAddress.ZERO,
      RevertCode.OK,
    );
  }

  static fromFields(fields: Fr[] | FieldReader): PublicKernelCircuitPublicInputs {
    const reader = FieldReader.asReader(fields);
    return new PublicKernelCircuitPublicInputs(
      CombinedConstantData.fromFields(reader),
      PublicValidationRequests.fromFields(reader),
      PublicAccumulatedData.fromFields(reader),
      PublicAccumulatedData.fromFields(reader),
      reader.readU32(),
      PublicCallRequest.fromFields(reader),
      AztecAddress.fromFields(reader),
      RevertCode.fromField(reader.readField()),
    );
  }

  [inspect.custom]() {
    return `PublicKernelCircuitPublicInputs {
      constants: ${inspect(this.constants)},
      validationRequests: ${inspect(this.validationRequests)},
      endNonRevertibleData: ${inspect(this.endNonRevertibleData)},
      end: ${inspect(this.end)},
      endSideEffectCounter: ${this.endSideEffectCounter},
      publicTeardownCallRequest: ${inspect(this.publicTeardownCallRequest)},
      feePayer: ${this.feePayer},
      revertCode: ${this.revertCode},
      }`;
  }
}
