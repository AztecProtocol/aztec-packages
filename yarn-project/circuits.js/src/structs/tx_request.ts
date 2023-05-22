import { AztecAddress } from '@aztec/foundation/aztec-address';
import { FieldsOf, assertMemberLength } from '../utils/jsUtils.js';
import { serializeToBuffer } from '../utils/serialize.js';
import { FunctionData } from './function_data.js';
import { EcdsaSignature } from './shared.js';
import { TxContext } from './tx_context.js';
import { Fr } from '@aztec/foundation/fields';
import { BufferReader } from '@aztec/foundation/serialize';
import { ARGS_LENGTH } from './constants.js';

/**
 * Signed transaction request.
 * @see cpp/src/aztec3/circuits/abis/signed_tx_request.hpp.
 */
export class SignedTxRequest {
  constructor(
    /**
     * Transaction request.
     */
    public txRequest: TxRequest,
    /**
     * Signature.
     */
    public signature: EcdsaSignature,
  ) {}

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.txRequest, this.signature);
  }

  /**
   * Deserialises from a buffer.
   * @param buffer - The buffer representation of the object.
   * @returns The new object.
   */
  static fromBuffer(buffer: Buffer | BufferReader): SignedTxRequest {
    const reader = BufferReader.asReader(buffer);
    return new SignedTxRequest(reader.readObject(TxRequest), reader.readObject(EcdsaSignature));
  }
}

/**
 * Transaction request.
 * @see cpp/src/aztec3/circuits/abis/tx_request.hpp.
 */
export class TxRequest {
  constructor(
    /**
     * Sender.
     */
    public from: AztecAddress,
    /**
     * Target.
     */
    public to: AztecAddress,
    /**
     * Function data representing the function to call.
     */
    public functionData: FunctionData,
    /**
     * Function arguments.
     */
    public args: Fr[],
    /**
     * Tx nonce.
     */
    public nonce: Fr,
    /**
     * Transaction context.
     */
    public txContext: TxContext,
    /**
     * Chain ID of the transaction. Here for replay protection.
     */
    public chainId: Fr,
  ) {
    assertMemberLength(this, 'args', ARGS_LENGTH);
  }

  static getFields(fields: FieldsOf<TxRequest>) {
    return [
      fields.from,
      fields.to,
      fields.functionData,
      fields.args,
      fields.nonce,
      fields.txContext,
      fields.chainId,
    ] as const;
  }

  static from(fields: FieldsOf<TxRequest>): TxRequest {
    return new TxRequest(...TxRequest.getFields(fields));
  }

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    const fields = TxRequest.getFields(this);
    return serializeToBuffer([...fields]);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   * @returns The deserialised TxRequest object.
   */
  static fromBuffer(buffer: Buffer | BufferReader): TxRequest {
    const reader = BufferReader.asReader(buffer);
    return new TxRequest(
      reader.readObject(AztecAddress),
      reader.readObject(AztecAddress),
      reader.readObject(FunctionData),
      reader.readArray<Fr, typeof ARGS_LENGTH>(ARGS_LENGTH, Fr),
      reader.readFr(),
      reader.readObject(TxContext),
      reader.readFr(),
    );
  }
}
