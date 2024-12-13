import { FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';

import { COUNTED_PUBLIC_CALL_REQUEST_LENGTH, PUBLIC_CALL_REQUEST_LENGTH } from '../constants.gen.js';
import { type UInt32 } from './shared.js';

/**
 * Represents a request to call a public function.
 */
export class PublicCallRequest {
  constructor(
    /**
     * Address of the account which represents the entity who invoked the call.
     */
    public msgSender: AztecAddress,
    /**
     * The contract address being called.
     */
    public contractAddress: AztecAddress,
    /**
     * Function selector of the function being called.
     */
    public functionSelector: FunctionSelector,
    /**
     * Determines whether the call is modifying state.
     */
    public isStaticCall: boolean,
    public argsHash: Fr,
  ) {}

  getSize() {
    return this.isEmpty() ? 0 : this.toBuffer().length;
  }

  static from(fields: FieldsOf<PublicCallRequest>): PublicCallRequest {
    return new PublicCallRequest(...PublicCallRequest.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicCallRequest>) {
    return [
      fields.msgSender,
      fields.contractAddress,
      fields.functionSelector,
      fields.isStaticCall,
      fields.argsHash,
    ] as const;
  }

  static fromFields(fields: Fr[] | FieldReader): PublicCallRequest {
    const reader = FieldReader.asReader(fields);
    return new PublicCallRequest(
      reader.readObject(AztecAddress),
      reader.readObject(AztecAddress),
      reader.readObject(FunctionSelector),
      reader.readBoolean(),
      reader.readField(),
    );
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...PublicCallRequest.getFields(this));
    if (fields.length !== PUBLIC_CALL_REQUEST_LENGTH) {
      throw new Error(
        `Invalid number of fields for PublicCallRequest. Expected ${PUBLIC_CALL_REQUEST_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicCallRequest(
      reader.readObject(AztecAddress),
      reader.readObject(AztecAddress),
      reader.readObject(FunctionSelector),
      reader.readBoolean(),
      reader.readObject(Fr),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PublicCallRequest.getFields(this));
  }

  static empty() {
    return new PublicCallRequest(AztecAddress.ZERO, AztecAddress.ZERO, FunctionSelector.empty(), false, Fr.ZERO);
  }

  isEmpty(): boolean {
    return (
      this.msgSender.isZero() &&
      this.contractAddress.isZero() &&
      this.functionSelector.isEmpty() &&
      !this.isStaticCall &&
      this.argsHash.isEmpty()
    );
  }

  [inspect.custom]() {
    return `PublicCallRequest {
      msgSender: ${this.msgSender}
      contractAddress: ${this.contractAddress}
      functionSelector: ${this.functionSelector}
      isStaticCall: ${this.isStaticCall}
      argsHash: ${this.argsHash}
    }`;
  }
}

export class CountedPublicCallRequest {
  constructor(public inner: PublicCallRequest, public counter: UInt32) {}

  getSize() {
    return this.isEmpty() ? 0 : this.toBuffer().length;
  }

  static getFields(fields: FieldsOf<CountedPublicCallRequest>) {
    return [fields.inner, fields.counter] as const;
  }

  static fromFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    return new CountedPublicCallRequest(reader.readObject(PublicCallRequest), reader.readU32());
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...CountedPublicCallRequest.getFields(this));
    if (fields.length !== COUNTED_PUBLIC_CALL_REQUEST_LENGTH) {
      throw new Error(
        `Invalid number of fields for CountedPublicCallRequest. Expected ${COUNTED_PUBLIC_CALL_REQUEST_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CountedPublicCallRequest(reader.readObject(PublicCallRequest), reader.readNumber());
  }

  toBuffer() {
    return serializeToBuffer(...CountedPublicCallRequest.getFields(this));
  }

  static empty() {
    return new CountedPublicCallRequest(PublicCallRequest.empty(), 0);
  }

  isEmpty(): boolean {
    return this.inner.isEmpty() && this.counter == 0;
  }
}
