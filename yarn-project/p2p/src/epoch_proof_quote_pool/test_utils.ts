import { EpochProofQuote, EpochProofQuotePayload } from '@aztec/circuit-types';
import { EthAddress } from '@aztec/circuits.js';
import { Buffer32 } from '@aztec/foundation/buffer';
import { Secp256k1Signer, randomBigInt, randomInt } from '@aztec/foundation/crypto';

export function makeRandomEpochProofQuotePayload(): EpochProofQuotePayload {
  return EpochProofQuotePayload.fromFields({
    basisPointFee: randomInt(10000),
    bondAmount: 1000000000000000000n,
    epochToProve: randomBigInt(1000000n),
    prover: EthAddress.random(),
    validUntilSlot: randomBigInt(1000000n),
    domainSeparator: Buffer32.random(),
  });
}

export function makeRandomEpochProofQuote(payload?: EpochProofQuotePayload): {
  quote: EpochProofQuote;
  signer: Secp256k1Signer;
} {
  const signer = Secp256k1Signer.random();

  return {
    quote: EpochProofQuote.new(payload ?? makeRandomEpochProofQuotePayload(), signer),
    signer,
  };
}
