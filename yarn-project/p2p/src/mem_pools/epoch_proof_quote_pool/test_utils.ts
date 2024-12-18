import { EpochProofQuote, EpochProofQuoteHasher, EpochProofQuotePayload } from '@aztec/circuit-types';
import { EthAddress } from '@aztec/circuits.js';
import { Secp256k1Signer, randomBigInt, randomInt } from '@aztec/foundation/crypto';

export function makeRandomEpochProofQuotePayload(): EpochProofQuotePayload {
  return EpochProofQuotePayload.from({
    basisPointFee: randomInt(10000),
    bondAmount: 1000000000000000000n,
    epochToProve: randomBigInt(1000000n),
    prover: EthAddress.random(),
    validUntilSlot: randomBigInt(1000000n),
  });
}

export function makeRandomEpochProofQuote(payload?: EpochProofQuotePayload): {
  quote: EpochProofQuote;
  signer: Secp256k1Signer;
} {
  const hasher = new EpochProofQuoteHasher(EthAddress.random(), 1, 1);
  const signer = Secp256k1Signer.random();

  return {
    quote: EpochProofQuote.new(hasher, payload ?? makeRandomEpochProofQuotePayload(), signer),
    signer,
  };
}
