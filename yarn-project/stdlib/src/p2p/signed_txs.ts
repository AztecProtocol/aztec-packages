import { Buffer32 } from '@aztec/foundation/buffer';
import { tryRecoverAddress } from '@aztec/foundation/crypto/secp256k1-signer';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import { MAX_TXS_PER_BLOCK } from '../deserialization/index.js';
import { Tx } from '../tx/tx.js';
import {
  SignatureDomainSeparator,
  getHashedSignaturePayload,
  getHashedSignaturePayloadEthSignedMessage,
} from './signature_utils.js';

/**
 * A signed collection of transactions.
 * The signature is over the transaction objects themselves, providing
 * data availability guarantees beyond just the transaction hashes.
 */
export class SignedTxs {
  private sender: EthAddress | undefined;

  constructor(
    /** The transactions */
    public readonly txs: Tx[],
    /** The proposer's signature over the transactions */
    public readonly signature: Signature,
  ) {}

  /**
   * Get the payload to sign for this signed txs.
   */
  getPayloadToSign(domainSeparator: SignatureDomainSeparator): Buffer {
    return serializeToBuffer([domainSeparator, this.txs.length, this.txs]);
  }

  /**
   * Lazily evaluate the sender of the signed txs; result is cached
   * @returns The sender address, or undefined if signature recovery fails
   */
  getSender(): EthAddress | undefined {
    if (!this.sender) {
      const hashed = getHashedSignaturePayloadEthSignedMessage(this, SignatureDomainSeparator.signedTxs);
      this.sender = tryRecoverAddress(hashed, this.signature);
    }
    return this.sender;
  }

  /**
   * Create SignedTxs from a signer function
   */
  static async createFromSigner(
    txs: Tx[],
    payloadSigner: (payload: Buffer32) => Promise<Signature>,
  ): Promise<SignedTxs> {
    const tempSignedTxs = new SignedTxs(txs, Signature.empty());
    const hashed = getHashedSignaturePayload(tempSignedTxs, SignatureDomainSeparator.signedTxs);
    const signature = await payloadSigner(hashed);
    return new SignedTxs(txs, signature);
  }

  toBuffer(): Buffer {
    return serializeToBuffer([this.txs.length, this.txs, this.signature]);
  }

  static fromBuffer(buf: Buffer | BufferReader): SignedTxs {
    const reader = BufferReader.asReader(buf);
    const txCount = reader.readNumber();
    if (txCount > MAX_TXS_PER_BLOCK) {
      throw new Error(`txs count ${txCount} exceeds maximum ${MAX_TXS_PER_BLOCK}`);
    }
    const txs = reader.readArray(txCount, Tx);
    const signature = reader.readObject(Signature);
    return new SignedTxs(txs, signature);
  }

  getSize(): number {
    return 4 /* txs.length */ + this.txs.reduce((acc, tx) => acc + tx.getSize(), 0) + this.signature.getSize();
  }

  static empty(): SignedTxs {
    return new SignedTxs([], Signature.empty());
  }

  static random(): SignedTxs {
    return new SignedTxs([Tx.random(), Tx.random()], Signature.random());
  }
}
