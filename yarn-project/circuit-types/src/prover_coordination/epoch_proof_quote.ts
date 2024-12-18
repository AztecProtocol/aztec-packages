import { Buffer32 } from '@aztec/foundation/buffer';
import { type Secp256k1Signer, keccak256, recoverAddress } from '@aztec/foundation/crypto';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { z } from 'zod';

import { Gossipable } from '../p2p/gossipable.js';
import { TopicType, createTopicString } from '../p2p/topic_type.js';
import { type EpochProofQuoteHasher } from './epoch_proof_quote_hasher.js';
import { EpochProofQuotePayload } from './epoch_proof_quote_payload.js';

export class EpochProofQuote extends Gossipable {
  static override p2pTopic: string = createTopicString(TopicType.epoch_proof_quote);

  constructor(public readonly payload: EpochProofQuotePayload, public readonly signature: Signature) {
    super();
  }

  static empty() {
    return new EpochProofQuote(EpochProofQuotePayload.empty(), Signature.empty());
  }

  static random() {
    return new EpochProofQuote(EpochProofQuotePayload.random(), Signature.random());
  }

  static getFields(fields: FieldsOf<EpochProofQuote>) {
    return [fields.payload, fields.signature] as const;
  }

  override p2pMessageIdentifier(): Buffer32 {
    // TODO: https://github.com/AztecProtocol/aztec-packages/issues/8911
    return new Buffer32(keccak256(this.signature.toBuffer()));
  }

  /**
   * Return the address of the signer of the signature
   */
  getSender(quoteHasher: EpochProofQuoteHasher) {
    const hashed = quoteHasher.hash(this.payload);
    return recoverAddress(hashed, this.signature);
  }

  override toBuffer(): Buffer {
    return serializeToBuffer(...EpochProofQuote.getFields(this));
  }

  static fromBuffer(buf: Buffer | BufferReader): EpochProofQuote {
    const reader = BufferReader.asReader(buf);
    return new EpochProofQuote(reader.readObject(EpochProofQuotePayload), reader.readObject(Signature));
  }

  static get schema() {
    return z
      .object({
        payload: EpochProofQuotePayload.schema,
        signature: Signature.schema,
      })
      .transform(({ payload, signature }) => new EpochProofQuote(payload, signature));
  }

  // TODO: https://github.com/AztecProtocol/aztec-packages/issues/8911
  /**
   * Creates a new quote with a signature.
   * The digest provided must match what the rollup contract will produce i.e. `_hashTypedDataV4(EpochProofQuoteLib.hash(quote))`
   *
   * @param digest the digest of the payload that should be signed
   * @param payload the actual quote
   * @param signer the signer
   * @returns a quote with an accompanying signature
   */
  static new(hasher: EpochProofQuoteHasher, payload: EpochProofQuotePayload, signer: Secp256k1Signer): EpochProofQuote {
    if (!payload.prover.equals(signer.address)) {
      throw new Error(`Quote prover does not match signer. Prover [${payload.prover}], Signer [${signer.address}]`);
    }

    const digest = hasher.hash(payload);
    const signature = signer.sign(digest);
    return new EpochProofQuote(payload, signature);
  }

  toViemArgs() {
    return {
      quote: this.payload.toViemArgs(),
      signature: this.signature.toViemSignature(),
    };
  }

  toInspect() {
    return {
      signature: this.signature.toString(),
      ...this.payload.toInspect(),
    };
  }

  /**
   * Get the size of the epoch proof quote in bytes.
   * @returns The size of the epoch proof quote in bytes.
   */
  getSize(): number {
    return this.payload.getSize() + this.signature.getSize();
  }
}
