import { AztecAddress } from '@aztec/foundation/aztec-address';
import { FieldsOf, assertLength } from '@aztec/foundation/utils';
import { serializeToBuffer } from '../utils/serialize.js';
import { FunctionData } from './function_data.js';
import { EcdsaSignature } from './shared.js';
import { TxContext } from './tx_context.js';
import { Fr } from '@aztec/foundation/fields';
import { ARGS_LENGTH } from './constants.js';
import { EthPublicKey } from '@aztec/foundation/eth-public-key';
import { hashTxRequest } from '../abis/abis.js';
import { CircuitsWasm } from '../index.js';
import { Ecdsa } from '@aztec/barretenberg.js/crypto';

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
     * Ethereum public used to sign the transaction.
     */
    public signingKey: EthPublicKey,
    /**
     * Signature.
     */
    public signature: EcdsaSignature,
  ) {}

  /**
   * Creates a new SignedTxRequest from txRequest and EcdsaSignature. Recovers the signing key
   * from the signature using the ecrecover algorithm.
   * @param txRequest - The transaction request.
   * @param signature - The signature created by signing over `txRequest`.
   *
   * @returns A SignedTxRequest instance with a recovered SigningKey.
   */
  public static async new(txRequest: TxRequest, signature: EcdsaSignature) {
    // Recover signing key from the signature.
    const wasm = await CircuitsWasm.get();
    const message = await hashTxRequest(wasm, txRequest);
    const ecdsa = new Ecdsa(wasm);
    const signingKeyBuffer: Buffer = ecdsa.recoverPublicKey(message, signature);
    const signingKey = EthPublicKey.fromBuffer(signingKeyBuffer);

    // Create a new instance of SignedTxRequest.
    return new SignedTxRequest(txRequest, signingKey, signature);
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
    assertLength(this, 'args', ARGS_LENGTH);
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
    return serializeToBuffer(...TxRequest.getFields(this));
  }
}
