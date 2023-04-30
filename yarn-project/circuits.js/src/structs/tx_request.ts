import { AztecAddress, BufferReader, Fr } from '@aztec/foundation';
import { FieldsOf } from '../utils/jsUtils.js';
import { serializeToBuffer } from '../utils/serialize.js';
import { FunctionData } from './function_data.js';
import { EcdsaSignature } from './shared.js';
import { TxContext } from './tx_context.js';

/**
 * Signed transaction request.
 * @see cpp/src/aztec3/circuits/abis/signed_tx_request.hpp.
 */
export class SignedTxRequest {
  constructor(public txRequest: TxRequest, public signature: EcdsaSignature) {}

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.txRequest, this.signature);
  }

  /**
   * Deserialises from a buffer.
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
    public from: AztecAddress,
    public to: AztecAddress,
    public functionData: FunctionData,
    public args: Fr[],
    public nonce: Fr,
    public txContext: TxContext,
    public chainId: Fr,
  ) {}

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
    const argsLength = this.args.length;
    return serializeToBuffer([argsLength, ...fields]);
  }

  /**
   * Deserializes from a buffer or reader, corresponding to a write in cpp.
   * @param buffer - Buffer to read from.
   */
  static fromBuffer(buffer: Buffer | BufferReader): TxRequest {
    const reader = BufferReader.asReader(buffer);
    const argsLength = reader.readNumber();
    return new TxRequest(
      reader.readObject(AztecAddress),
      reader.readObject(AztecAddress),
      reader.readObject(FunctionData),
      reader.readArray<Fr>(argsLength, Fr),
      reader.readFr(),
      reader.readObject(TxContext),
      reader.readFr(),
    );
  }
}
