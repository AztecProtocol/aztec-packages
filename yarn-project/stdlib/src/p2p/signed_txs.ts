import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import type { TypedDataDefinition } from 'viem';

import { MAX_TXS_PER_BLOCK } from '../deserialization/index.js';
import { Tx } from '../tx/tx.js';
import {
  type CoordinationSignatureContext,
  type CoordinationSignatureType,
  EMPTY_COORDINATION_SIGNATURE_CONTEXT,
  type Signable,
  getCoordinationSignatureTypedData,
  readCoordinationSignatureContext,
  recoverCoordinationSigner,
  serializeCoordinationSignatureContext,
} from './signature_utils.js';

/**
 * A signed collection of transactions.
 * The signature is over the transaction objects themselves, providing
 * data availability guarantees beyond just the transaction hashes.
 */
export class SignedTxs implements Signable {
  readonly primaryType: CoordinationSignatureType = 'SignedTxs';

  private cachedSender: EthAddress | undefined | null = undefined;

  constructor(
    /** The transactions */
    public readonly txs: Tx[],
    /** The proposer's signature over the transactions */
    public readonly signature: Signature,
    /** The signing domain (chainId + rollupAddress) the signature is bound to */
    public readonly signatureContext: CoordinationSignatureContext,
  ) {}

  getPayloadToSign(): Buffer {
    return serializeToBuffer([this.txs.length, this.txs]);
  }

  /**
   * Lazily evaluate the sender of the signed txs; result is cached.
   * @returns The sender address, or undefined if signature recovery fails
   */
  getSender(): EthAddress | undefined {
    if (this.cachedSender === undefined) {
      this.cachedSender = recoverCoordinationSigner(this, this.signature) ?? null;
    }
    return this.cachedSender ?? undefined;
  }

  /**
   * Create SignedTxs from a typed-data signer function
   */
  static async createFromSigner(
    txs: Tx[],
    signatureContext: CoordinationSignatureContext,
    typedDataSigner: (typedData: TypedDataDefinition) => Promise<Signature>,
  ): Promise<SignedTxs> {
    const tempSignedTxs = new SignedTxs(txs, Signature.empty(), signatureContext);
    const typedData = getCoordinationSignatureTypedData(tempSignedTxs);
    const signature = await typedDataSigner(typedData);
    return new SignedTxs(txs, signature, signatureContext);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([
      this.txs.length,
      this.txs,
      this.signature,
      serializeCoordinationSignatureContext(this.signatureContext),
    ]);
  }

  static fromBuffer(buf: Buffer | BufferReader): SignedTxs {
    const reader = BufferReader.asReader(buf);
    const txCount = reader.readNumber();
    if (txCount > MAX_TXS_PER_BLOCK) {
      throw new Error(`txs count ${txCount} exceeds maximum ${MAX_TXS_PER_BLOCK}`);
    }
    const txs = reader.readArray(txCount, Tx);
    const signature = reader.readObject(Signature);
    const signatureContext = readCoordinationSignatureContext(reader);
    return new SignedTxs(txs, signature, signatureContext);
  }

  getSize(): number {
    return (
      4 /* txs.length */ +
      this.txs.reduce((acc, tx) => acc + tx.getSize(), 0) +
      this.signature.getSize() +
      4 /* chainId */ +
      20 /* rollupAddress */
    );
  }

  static empty(): SignedTxs {
    return new SignedTxs([], Signature.empty(), EMPTY_COORDINATION_SIGNATURE_CONTEXT);
  }

  static random(): SignedTxs {
    return new SignedTxs([Tx.random(), Tx.random()], Signature.random(), EMPTY_COORDINATION_SIGNATURE_CONTEXT);
  }
}
