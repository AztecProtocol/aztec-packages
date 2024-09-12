import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import { MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX } from '../../constants.gen.js';
import { Gas } from '../gas.js';
import { PublicCallRequest } from '../public_call_request.js';
import { PublicInnerCallRequest } from '../public_inner_call_request.js';
import { PublicValidationRequests } from '../public_validation_requests.js';
import { CombinedConstantData } from './combined_constant_data.js';
import { PublicAccumulatedData } from './public_accumulated_data.js';

/**
 * Call stack item on a public call.
 */
export class VMCircuitPublicInputs {
  constructor(
    public constants: CombinedConstantData,
    public callRequest: PublicCallRequest,
    public publicCallStack: Tuple<PublicInnerCallRequest, typeof MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,
    public validationRequests: PublicValidationRequests,
    public accumulatedData: PublicAccumulatedData,
    public startGasLeft: Gas,
    public transactionFee: Fr,
    public reverted: boolean,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.constants,
      this.callRequest,
      this.publicCallStack,
      this.validationRequests,
      this.accumulatedData,
      this.startGasLeft,
      this.transactionFee,
      this.reverted,
    );
  }

  clone() {
    return VMCircuitPublicInputs.fromBuffer(this.toBuffer());
  }

  toString() {
    return this.toBuffer().toString('hex');
  }

  static fromString(str: string) {
    return VMCircuitPublicInputs.fromBuffer(Buffer.from(str, 'hex'));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new VMCircuitPublicInputs(
      reader.readObject(CombinedConstantData),
      reader.readObject(PublicCallRequest),
      reader.readArray(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, PublicInnerCallRequest),
      reader.readObject(PublicValidationRequests),
      reader.readObject(PublicAccumulatedData),
      reader.readObject(Gas),
      reader.readObject(Fr),
      reader.readBoolean(),
    );
  }

  static empty() {
    return new VMCircuitPublicInputs(
      CombinedConstantData.empty(),
      PublicCallRequest.empty(),
      makeTuple(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, PublicInnerCallRequest.empty),
      PublicValidationRequests.empty(),
      PublicAccumulatedData.empty(),
      Gas.empty(),
      Fr.ZERO,
      false,
    );
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new VMCircuitPublicInputs(
      CombinedConstantData.fromFields(reader),
      PublicCallRequest.fromFields(reader),
      reader.readArray(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, PublicInnerCallRequest),
      PublicValidationRequests.fromFields(reader),
      PublicAccumulatedData.fromFields(reader),
      Gas.fromFields(reader),
      reader.readField(),
      reader.readBoolean(),
    );
  }

  [inspect.custom]() {
    return `VMCircuitPublicInputs {
      constants: ${inspect(this.constants)},
      callRequest: ${inspect(this.callRequest)}
      validationRequests: ${inspect(this.validationRequests)},
      accumulatedData: ${inspect(this.accumulatedData)},
      startGasLeft: ${this.startGasLeft},
      transactionFee: ${this.transactionFee},
      reverted: ${this.reverted},
      }`;
  }
}
