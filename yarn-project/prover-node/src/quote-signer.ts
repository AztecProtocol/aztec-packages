import { EpochProofQuote, type EpochProofQuotePayload } from '@aztec/circuit-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { type RollupAbi } from '@aztec/l1-artifacts';

import { type GetContractReturnType, type PublicClient } from 'viem';

export class QuoteSigner {
  constructor(
    private readonly signer: Secp256k1Signer,
    private readonly quoteToDigest: (payload: EpochProofQuotePayload) => Promise<Buffer32>,
  ) {}

  static new(privateKey: Buffer32, rollupContract: GetContractReturnType<typeof RollupAbi, PublicClient>): QuoteSigner {
    const quoteToDigest = (payload: EpochProofQuotePayload) =>
      rollupContract.read.quoteToDigest([payload.toViemArgs()]).then(Buffer32.fromString);
    return new QuoteSigner(new Secp256k1Signer(privateKey), quoteToDigest);
  }

  public async sign(payload: EpochProofQuotePayload) {
    const digest = await this.quoteToDigest(payload);
    return EpochProofQuote.new(digest, payload, this.signer);
  }
}
