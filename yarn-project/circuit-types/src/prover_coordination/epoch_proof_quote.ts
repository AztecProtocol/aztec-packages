import { type EthAddress } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { type Secp256k1Signer, recoverAddress } from '@aztec/foundation/crypto';
import { Signature } from '@aztec/foundation/eth-signature';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { type FieldsOf } from '@aztec/foundation/types';

import { Gossipable } from '../p2p/gossipable.js';
import { getHashedSignaturePayloadEthSignedMessage } from '../p2p/signature_utils.js';
import { EpochProofQuotePayload } from './epoch_proof_quote_payload.js';

export class EpochProofQuote extends Gossipable {
  // TODO:
  static override p2pTopic: string = '';

  private sender: EthAddress | undefined;

  constructor(public readonly payload: EpochProofQuotePayload, public readonly signature: Signature) {
    super();
  }

  static getFields(fields: FieldsOf<EpochProofQuote>) {
    return [fields.payload, fields.signature] as const;
  }

  override p2pMessageIdentifier(): Buffer32 {
    return new Buffer32(this.signature.toBuffer());
  }

  override toBuffer(): Buffer {
    return serializeToBuffer(...EpochProofQuote.getFields(this));
  }

  static fromBuffer(buf: Buffer | BufferReader): EpochProofQuote {
    const reader = BufferReader.asReader(buf);
    return new EpochProofQuote(reader.readObject(EpochProofQuotePayload), reader.readObject(Signature));
  }

  static new(payload: EpochProofQuotePayload, signer: Secp256k1Signer): EpochProofQuote {
    const digest = getHashedSignaturePayloadEthSignedMessage(payload);
    const signature = signer.sign(digest);
    return new EpochProofQuote(payload, signature);
  }

  get senderAddress(): EthAddress {
    if (!this.sender) {
      const hashed = getHashedSignaturePayloadEthSignedMessage(this.payload);

      // Cache the sender for later use
      this.sender = recoverAddress(hashed, this.signature);
    }

    return this.sender;
  }
}
