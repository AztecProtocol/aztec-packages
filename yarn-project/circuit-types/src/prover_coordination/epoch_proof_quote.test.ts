import { EthAddress } from '@aztec/circuits.js';
import { Secp256k1Signer } from '@aztec/foundation/crypto';

import { EpochProofQuote } from './epoch_proof_quote.js';
import { EpochProofQuotePayload } from './epoch_proof_quote_payload.js';

describe('epoch proof quote', () => {
  it('should serialize / deserialize', () => {
    const signer = Secp256k1Signer.random();
    const payload = EpochProofQuotePayload.fromFields({
      basisPointFee: 5000,
      bondAmount: 1000000000000000000n,
      epochToProve: 42n,
      prover: EthAddress.random(),
      validUntilSlot: 100n,
    });

    const quote = EpochProofQuote.new(payload, signer);

    expect(EpochProofQuote.fromBuffer(quote.toBuffer())).toEqual(quote);

    expect(quote.senderAddress).toEqual(signer.address);
  });
});
