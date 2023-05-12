import { AztecAddress } from '@aztec/foundation/aztec-address';
import { FieldsOf } from '../utils/jsUtils.js';
import { serializeToBuffer } from '../utils/serialize.js';
import { FunctionData } from './function_data.js';
import { EcdsaSignature } from './shared.js';
import { TxContext } from './tx_context.js';
import { Fr } from '@aztec/foundation/fields';
import { EthPublicKey } from '@aztec/foundation/eth-public-key';
import { hashTxRequest } from '../abis/abis.js';
import { CircuitsWasm } from '../index.js';
import { Ecdsa } from '@aztec/barretenberg.js/crypto';

/**
 * Signed transaction request.
 * @see cpp/src/aztec3/circuits/abis/signed_tx_request.hpp.
 */
export class SignedTxRequest {
  public constructor(public txRequest: TxRequest, public signature: EcdsaSignature, public signingKey: EthPublicKey) {}

  public static async new(txRequest: TxRequest, signature: EcdsaSignature) {
    // Recover signing key from the signature.
    const wasm = await CircuitsWasm.get();
    const message = await hashTxRequest(wasm, txRequest);
    const ecdsa = new Ecdsa(wasm);
    const signingKeyBuffer: Buffer = ecdsa.recoverPublicKey(message, signature);
    const signingKey = EthPublicKey.fromBuffer(signingKeyBuffer);

    // Create a new instance of SignedTxRequest.
    return new SignedTxRequest(txRequest, signature, signingKey);
  }

  /**
   * Serialize as a buffer.
   * @returns The buffer.
   */
  toBuffer() {
    return serializeToBuffer(this.txRequest, this.signingKey, this.signature);
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
    return serializeToBuffer(...TxRequest.getFields(this));
  }
}
