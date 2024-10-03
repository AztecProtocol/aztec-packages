import { EthAddress } from '@aztec/circuits.js';

import { EpochProofQuotePayload } from './epoch_proof_quote_payload.js';

describe('epoch proof quote', () => {
  it('should serialize / deserialize', () => {
    const payload = EpochProofQuotePayload.from({
      basisPointFee: 5000,
      bondAmount: 1000000000000000000n,
      epochToProve: 42n,
      prover: EthAddress.random(),
      validUntilSlot: 100n,
    });

    expect(EpochProofQuotePayload.fromBuffer(payload.toBuffer())).toEqual(payload);
  });
});
