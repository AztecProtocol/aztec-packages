import { makeTuple } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, type Tuple, serializeToBuffer } from '@aztec/foundation/serialize';

import { inspect } from 'util';

import { MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX } from '../../constants.gen.js';
import { Gas } from '../gas.js';
import { PublicCallRequest } from '../public_call_request.js';
import { PublicInnerCallRequest } from '../public_inner_call_request.js';
import { PublicValidationRequestArrayLengths, PublicValidationRequests } from '../public_validation_requests.js';
import { CombinedConstantData } from './combined_constant_data.js';
import { PublicAccumulatedData, PublicAccumulatedDataArrayLengths } from './public_accumulated_data.js';

/**
 * Call stack item on a public call.
 */
export class VMCircuitPublicInputs {
  constructor(
    public constants: CombinedConstantData,
    public callRequest: PublicCallRequest,
    public publicCallStack: Tuple<PublicInnerCallRequest, typeof MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX>,
    public previousValidationRequestArrayLengths: PublicValidationRequestArrayLengths,
    public validationRequests: PublicValidationRequests,
    public previousAccumulatedDataArrayLengths: PublicAccumulatedDataArrayLengths,
    public accumulatedData: PublicAccumulatedData,
    public startSideEffectCounter: number,
    public endSideEffectCounter: number,
    public startGasLeft: Gas,
    public transactionFee: Fr,
    public reverted: boolean,
  ) {}

  toBuffer() {
    return serializeToBuffer(
      this.constants,
      this.callRequest,
      this.publicCallStack,
      this.previousValidationRequestArrayLengths,
      this.validationRequests,
      this.previousAccumulatedDataArrayLengths,
      this.accumulatedData,
      this.startSideEffectCounter,
      this.endSideEffectCounter,
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
      reader.readObject(PublicValidationRequestArrayLengths),
      reader.readObject(PublicValidationRequests),
      reader.readObject(PublicAccumulatedDataArrayLengths),
      reader.readObject(PublicAccumulatedData),
      reader.readNumber(),
      reader.readNumber(),
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
      PublicValidationRequestArrayLengths.empty(),
      PublicValidationRequests.empty(),
      PublicAccumulatedDataArrayLengths.empty(),
      PublicAccumulatedData.empty(),
      0,
      0,
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
      PublicValidationRequestArrayLengths.fromFields(reader),
      PublicValidationRequests.fromFields(reader),
      PublicAccumulatedDataArrayLengths.fromFields(reader),
      PublicAccumulatedData.fromFields(reader),
      reader.readU32(),
      reader.readU32(),
      Gas.fromFields(reader),
      reader.readField(),
      reader.readBoolean(),
    );
  }

  [inspect.custom]() {
    return `VMCircuitPublicInputs {
      constants: ${inspect(this.constants)},
      callRequest: ${inspect(this.callRequest)}
      previousValidationRequestArrayLengths: ${inspect(this.previousValidationRequestArrayLengths)},
      validationRequests: ${inspect(this.validationRequests)},
      previousAccumulatedDataArrayLengths: ${inspect(this.previousAccumulatedDataArrayLengths)},
      accumulatedData: ${inspect(this.accumulatedData)},
      startSideEffectCounter: ${this.startSideEffectCounter},
      endSideEffectCounter: ${this.endSideEffectCounter},
      startGasLeft: ${this.startGasLeft},
      transactionFee: ${this.transactionFee},
      reverted: ${this.reverted},
      }`;
  }
}
