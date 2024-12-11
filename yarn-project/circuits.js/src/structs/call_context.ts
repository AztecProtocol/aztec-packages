import { FunctionSelector } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { type Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import { CALL_CONTEXT_LENGTH } from '../constants.gen.js';

/**
 * Call context.
 */
export class CallContext {
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
  ) {}

  /**
   * Returns a new instance of CallContext with zero msg sender, storage contract address.
   * @returns A new instance of CallContext with zero msg sender, storage contract address.
   */
  public static empty(): CallContext {
    return new CallContext(AztecAddress.ZERO, AztecAddress.ZERO, FunctionSelector.empty(), false);
  }

  static random() {
    return new CallContext(
      AztecAddress.random(),
      AztecAddress.random(),
      FunctionSelector.random(),
      Math.random() > 0.5,
    );
  }

  static get schema() {
    return z
      .object({
        msgSender: schemas.AztecAddress,
        contractAddress: schemas.AztecAddress,
        functionSelector: schemas.FunctionSelector,
        isStaticCall: z.boolean(),
      })
      .transform(CallContext.from);
  }

  isEmpty() {
    return (
      this.msgSender.isZero() && this.contractAddress.isZero() && this.functionSelector.isEmpty() && !this.isStaticCall
    );
  }

  static from(fields: FieldsOf<CallContext>): CallContext {
    return new CallContext(...CallContext.getFields(fields));
  }

  static getFields(fields: FieldsOf<CallContext>) {
    return [fields.msgSender, fields.contractAddress, fields.functionSelector, fields.isStaticCall] as const;
  }

  /**
   * Serialize this as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(...CallContext.getFields(this));
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...CallContext.getFields(this));
    if (fields.length !== CALL_CONTEXT_LENGTH) {
      throw new Error(
        `Invalid number of fields for CallContext. Expected ${CALL_CONTEXT_LENGTH}, got ${fields.length}`,
      );
    }
    return fields;
  }

  /**
   * Deserialize this from a buffer.
   * @param buffer - The bufferable type from which to deserialize.
   * @returns The deserialized instance of CallContext.
   */
  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new CallContext(
      reader.readObject(AztecAddress),
      reader.readObject(AztecAddress),
      reader.readObject(FunctionSelector),
      reader.readBoolean(),
    );
  }

  static fromFields(fields: Fr[] | FieldReader): CallContext {
    const reader = FieldReader.asReader(fields);
    return new CallContext(
      reader.readObject(AztecAddress),
      reader.readObject(AztecAddress),
      reader.readObject(FunctionSelector),
      reader.readBoolean(),
    );
  }

  equals(callContext: CallContext) {
    return (
      callContext.msgSender.equals(this.msgSender) &&
      callContext.contractAddress.equals(this.contractAddress) &&
      callContext.functionSelector.equals(this.functionSelector) &&
      callContext.isStaticCall === this.isStaticCall
    );
  }

  [inspect.custom]() {
    return `CallContext {
      msgSender: ${this.msgSender}
      contractAddress: ${this.contractAddress}
      functionSelector: ${this.functionSelector}
      isStaticCall: ${this.isStaticCall}
    }`;
  }
}
