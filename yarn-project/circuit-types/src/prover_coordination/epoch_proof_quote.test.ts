import { EthAddress } from '@aztec/circuits.js';
import { Signature } from '@aztec/foundation/eth-signature';
import { jsonParseWithSchema, jsonStringify } from '@aztec/foundation/json-rpc';

import { EpochProofQuote } from './epoch_proof_quote.js';
import { EpochProofQuotePayload } from './epoch_proof_quote_payload.js';

describe('epoch proof quote', () => {
  let quote: EpochProofQuote;

  beforeEach(() => {
    const payload = EpochProofQuotePayload.from({
      basisPointFee: 5000,
      bondAmount: 1000000000000000000n,
      epochToProve: 42n,
      prover: EthAddress.random(),
      validUntilSlot: 100n,
    });

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
    const deserialised = jsonParseWithSchema(jsonStringify(quote), EpochProofQuote.schema);
    checkEquivalence(quote, deserialised);
  });
});
