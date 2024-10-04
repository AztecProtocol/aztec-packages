import { EthAddress } from '@aztec/circuits.js';
import { Signature } from '@aztec/foundation/eth-signature';

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

  it('should serialize and deserialize from buffer', () => {
    expect(EpochProofQuote.fromBuffer(quote.toBuffer())).toEqual(quote);
  });

  it('should serialize and deserialize from JSON', () => {
    expect(EpochProofQuote.fromJSON(quote.toJSON())).toEqual(quote);
  });
});
