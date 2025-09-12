import { GeneratorIndex, TX_REQUEST_LENGTH } from '@aztec/constants';
import { poseidon2HashWithSeparator } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader, serializeToBuffer, serializeToFields } from '@aztec/foundation/serialize';
import type { FieldsOf } from '@aztec/foundation/types';

import { AztecAddress } from '../aztec-address/index.js';
import { FunctionData } from './function_data.js';
import { TxContext } from './tx_context.js';

/**
 * Transaction request.
 */
export class TxRequest {
  // docs:start:constructor
  constructor(
    /** Sender. */
    public origin: AztecAddress,
    /** Pedersen hash of function arguments. */
    public argsHash: Fr,
    /** Transaction context. */
    public txContext: TxContext,
    /** Function data representing the function to call. */
    public functionData: FunctionData,
    /** A salt to make the hash difficult to predict. The hash is used as the first nullifier if there is no nullifier emitted throughout the tx. */
    public salt: Fr,
  ) {}
  // docs:end:constructor

  static getFields(fields: FieldsOf<TxRequest>) {
    return [fields.origin, fields.argsHash, fields.txContext, fields.functionData, fields.salt] as const;
  }

  static from(fields: FieldsOf<TxRequest>): TxRequest {
    return new TxRequest(...TxRequest.getFields(fields));
  }

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer([...TxRequest.getFields(this)]);
  }

  toFields(): Fr[] {
    const fields = serializeToFields(...TxRequest.getFields(this));
    if (fields.length !== TX_REQUEST_LENGTH) {
      throw new Error(`Invalid number of fields for TxRequest. Expected ${TX_REQUEST_LENGTH}, got ${fields.length}`);
    }
    return fields;
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   * @returns The deserialized TxRequest object.
   */
  static fromBuffer(buffer: Buffer | BufferReader): TxRequest {
    const reader = BufferReader.asReader(buffer);
    return new TxRequest(
      reader.readObject(AztecAddress),
      Fr.fromBuffer(reader),
      reader.readObject(TxContext),
      reader.readObject(FunctionData),
      Fr.fromBuffer(reader),
    );
  }

  hash() {
    return poseidon2HashWithSeparator(this.toFields(), GeneratorIndex.TX_REQUEST);
  }

  static empty() {
    return new TxRequest(AztecAddress.ZERO, Fr.zero(), TxContext.empty(), FunctionData.empty(), Fr.zero());
  }

  isEmpty() {
    return (
      this.origin.isZero() &&
      this.argsHash.isZero() &&
      this.txContext.isEmpty() &&
      this.functionData.isEmpty() &&
      this.salt.isZero()
    );
  }
}
