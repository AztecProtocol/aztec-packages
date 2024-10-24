import { EthAddress, PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_FEE_ASSET } from '@aztec/circuits.js';
import { Signature } from '@aztec/foundation/eth-signature';

import { EpochProofQuote } from './epoch_proof_quote.js';
import { EpochProofQuotePayload } from './epoch_proof_quote_payload.js';

describe('epoch proof quote', () => {
  let quote: EpochProofQuote;

  const defaultQuotePayload = {
    basisPointFee: 5000,
    bondAmount: 1000000000000000000n,
    epochToProve: 42n,
    prover: EthAddress.random(),
    validUntilSlot: 100n,
  };

  beforeEach(() => {
    const payload = EpochProofQuotePayload.from(defaultQuotePayload);

    quote = new EpochProofQuote(payload, Signature.random());
  });

  const checkEquivalence = (serialized: EpochProofQuote, deserialized: EpochProofQuote) => {
    expect(deserialized.getSize()).toEqual(serialized.getSize());
    expect(deserialized).toEqual(serialized);
  };

  it('should serialize and deserialize from buffer', () => {
    const deserialised = EpochProofQuote.fromBuffer(quote.toBuffer());
    checkEquivalence(quote, deserialised);
  });

  it('should serialize and deserialize from JSON', () => {
    const deserialised = EpochProofQuote.fromJSON(quote.toJSON());
    checkEquivalence(quote, deserialised);
  });

  describe('isValid', () => {
    it('requires minimum bond', () => {
      const payload = EpochProofQuotePayload.from({
        ...defaultQuotePayload,
        bondAmount: BigInt(PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_FEE_ASSET) - 1n,
      });
      const quote = new EpochProofQuote(payload, Signature.random());
      expect(quote.isValid()).toBe(false);
    });
  });
});
