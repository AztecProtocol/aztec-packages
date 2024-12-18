import { EpochProofQuote, type EpochProofQuoteHasher, type EpochProofQuotePayload } from '@aztec/circuit-types';
import { type Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer } from '@aztec/foundation/crypto';

export class QuoteSigner {
  constructor(private readonly hasher: EpochProofQuoteHasher, private readonly signer: Secp256k1Signer) {}

  static new(hasher: EpochProofQuoteHasher, privateKey: Buffer32): QuoteSigner {
    return new QuoteSigner(hasher, new Secp256k1Signer(privateKey));
  }

  public sign(payload: EpochProofQuotePayload) {
    return EpochProofQuote.new(this.hasher, payload, this.signer);
  }
}
