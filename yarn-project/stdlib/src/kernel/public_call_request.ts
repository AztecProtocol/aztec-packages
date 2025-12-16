import { COUNTED_PUBLIC_CALL_REQUEST_LENGTH, PUBLIC_CALL_REQUEST_LENGTH } from '@aztec/constants';
import { Fr } from '@aztec/foundation/fields';
import { schemas } from '@aztec/foundation/schemas';
import { BufferReader, FieldReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { inspect } from 'util';
import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { computeCalldataHash } from '../hash/index.js';
import type { UInt32 } from '../types/shared.js';

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
     * Determines whether the call is modifying state.
     */
    public isStaticCall: boolean,
    /**
     * Hash of the calldata of the function being called.
     */
    public calldataHash: Fr,
  ) {}

  static get schema() {
    return z
      .object({
        msgSender: AztecAddress.schema,
        contractAddress: AztecAddress.schema,
        isStaticCall: z.boolean(),
        calldataHash: schemas.Fr,
      })
      .transform(({ msgSender, contractAddress, isStaticCall, calldataHash }) => {
        return new PublicCallRequest(msgSender, contractAddress, isStaticCall, calldataHash);
      });
  }

  getSize() {
    return this.isEmpty() ? 0 : this.toBuffer().length;
  }

  static from(fields: FieldsOf<PublicCallRequest>): PublicCallRequest {
    return new PublicCallRequest(...PublicCallRequest.getFields(fields));
  }

  static getFields(fields: FieldsOf<PublicCallRequest>) {
    return [fields.msgSender, fields.contractAddress, fields.isStaticCall, fields.calldataHash] as const;
  }

  static fromFields(fields: Fr[] | FieldReader): PublicCallRequest {
    const reader = FieldReader.asReader(fields);
    return new PublicCallRequest(
      reader.readObject(AztecAddress),
      reader.readObject(AztecAddress),
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
      reader.readBoolean(),
      reader.readObject(Fr),
    );
  }

  toBuffer() {
    return serializeToBuffer(...PublicCallRequest.getFields(this));
  }

  static empty() {
    return new PublicCallRequest(AztecAddress.ZERO, AztecAddress.ZERO, false, Fr.ZERO);
  }

  isEmpty(): boolean {
    return (
      this.msgSender.isZero() && this.contractAddress.isZero() && !this.isStaticCall && this.calldataHash.isEmpty()
    );
  }

  [inspect.custom]() {
    return `PublicCallRequest {
      msgSender: ${this.msgSender}
      contractAddress: ${this.contractAddress}
      isStaticCall: ${this.isStaticCall}
      calldataHash: ${this.calldataHash}
    }`;
  }

  static async fromCalldata(
    msgSender: AztecAddress,
    contractAddress: AztecAddress,
    isStaticCall: boolean,
    calldata: Fr[],
  ) {
    const calldataHash = await computeCalldataHash(calldata);
    return new PublicCallRequest(msgSender, contractAddress, isStaticCall, calldataHash);
  }
}

/**
 * Represents lengths of arrays of public call requests.
 */
export class PublicCallRequestArrayLengths {
  constructor(
    /**
     * Number of setup call requests
     */
    public setupCalls: number,
    /**
     * Number of app logic call requests
     */
    public appLogicCalls: number,
    /**
     * Whether there is a teardown call request
     */
    public teardownCall: boolean,
  ) {}

  static get schema() {
    return z
      .object({
        setupCalls: z.number(),
        appLogicCalls: z.number(),
        teardownCall: z.boolean(),
      })
      .transform(({ setupCalls, appLogicCalls, teardownCall }) => {
        return new PublicCallRequestArrayLengths(setupCalls, appLogicCalls, teardownCall);
      });
  }

  static getFields(fields: FieldsOf<PublicCallRequestArrayLengths>) {
    return [fields.setupCalls, fields.appLogicCalls, fields.teardownCall] as const;
  }

  static fromFields(fields: Fr[] | FieldReader): PublicCallRequestArrayLengths {
    const reader = FieldReader.asReader(fields);
    return new PublicCallRequestArrayLengths(reader.readU32(), reader.readU32(), reader.readBoolean());
  }

  toFields(): Fr[] {
    return serializeToFields(...PublicCallRequestArrayLengths.getFields(this));
  }

  static fromBuffer(buffer: Buffer | BufferReader) {
    const reader = BufferReader.asReader(buffer);
    return new PublicCallRequestArrayLengths(reader.readNumber(), reader.readNumber(), reader.readBoolean());
  }

  toBuffer() {
    return serializeToBuffer(...PublicCallRequestArrayLengths.getFields(this));
  }

  static empty() {
    return new PublicCallRequestArrayLengths(0, 0, false);
  }

  [inspect.custom]() {
    return `PublicCallRequestArrayLengths {
      setupCalls: ${this.setupCalls}
      appLogicCalls: ${this.appLogicCalls}
      teardownCall: ${this.teardownCall}
    }`;
  }
}

export class CountedPublicCallRequest {
  constructor(
    public inner: PublicCallRequest,
    public counter: UInt32,
  ) {}

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
