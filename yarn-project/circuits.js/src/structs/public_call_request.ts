import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';

import { CallContext } from './call_context.js';

/**
 * Represents a request to call a public function.
 */
export class PublicCallRequest {
  constructor(
    public contractAddress: AztecAddress,
    public callContext: CallContext,
    public argsHash: Fr,
    public counter: number,
  ) {}

  getSize() {
    return this.isEmpty() ? 0 : this.toBuffer().length;
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.contractAddress, this.callContext, this.argsHash, this.counter);
  }

  /**
   * Deserialize this from a buffer.
   * @param buffer - The bufferable type from which to deserialize.
   * @returns The deserialized instance of PublicCallRequest.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicCallRequest(
      reader.readObject(AztecAddress),
      reader.readObject(CallContext),
      reader.readObject(Fr),
      reader.readNumber(),
    );
  }

  /**
   * Create PublicCallRequest from a fields dictionary.
   * @param fields - The dictionary.
   * @returns A PublicCallRequest object.
   */
  static from(fields: FieldsOf<PublicCallRequest>): PublicCallRequest {
    return new PublicCallRequest(...PublicCallRequest.getFields(fields));
  }

  /**
   * Serialize into a field array. Low-level utility.
   * @param fields - Object with fields.
   * @returns The array.
   */
  static getFields(fields: FieldsOf<PublicCallRequest>) {
    return [fields.contractAddress, fields.callContext, fields.argsHash, fields.counter] as const;
  }

  toFields(): Fr[] {
    return serializeToFields([this.contractAddress, this.callContext, this.argsHash, this.counter]);
  }

  static fromFields(fields: Fr[] | FieldReader): PublicCallRequest {
    const reader = FieldReader.asReader(fields);
    return new PublicCallRequest(
      AztecAddress.fromFields(reader),
      CallContext.fromFields(reader),
      reader.readField(),
      reader.readU32(),
    );
  }

  static empty() {
    return new PublicCallRequest(AztecAddress.ZERO, CallContext.empty(), Fr.ZERO, 0);
  }

  isEmpty(): boolean {
    return this.contractAddress.isZero() && this.callContext.isEmpty() && this.argsHash.isEmpty() && this.counter == 0;
  }

  [inspect.custom]() {
    return `PublicCallRequest {
      contractAddress: ${this.contractAddress}
      callContext: ${this.callContext}
      argsHash: ${this.argsHash}
      counter: ${this.counter}
    }`;
  }
}
