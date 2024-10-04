import { EpochProofQuote, EpochProofQuotePayload } from '@aztec/circuit-types';
import { EthAddress } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
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
  const signer = Secp256k1Signer.random();

  return {
    quote: EpochProofQuote.new(Buffer32.random(), payload ?? makeRandomEpochProofQuotePayload(), signer),
    signer,
  };
}
