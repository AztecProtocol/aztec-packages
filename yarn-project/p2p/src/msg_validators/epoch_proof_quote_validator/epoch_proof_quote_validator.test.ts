import {
  EpochProofQuote,
  type EpochProofQuoteHasher,
  EpochProofQuotePayload,
  PeerErrorSeverity,
} from '@aztec/circuit-types';
import { type EpochCache } from '@aztec/epoch-cache';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Signature } from '@aztec/foundation/eth-signature';

import { mock } from 'jest-mock-extended';

import { EpochProofQuoteValidator } from './epoch_proof_quote_validator.js';

describe('EpochProofQuoteValidator', () => {
  let epochCache: EpochCache;
  let validator: EpochProofQuoteValidator;
  let epochProofQuoteHasher: EpochProofQuoteHasher;

  beforeEach(() => {
    epochCache = mock<EpochCache>();
    epochProofQuoteHasher = mock<EpochProofQuoteHasher>();
    validator = new EpochProofQuoteValidator(epochCache, epochProofQuoteHasher);
  });

  const makeEpochProofQuote = (epochToProve: bigint) => {
    const payload = EpochProofQuotePayload.from({
      basisPointFee: 5000,
      bondAmount: 1000000000000000000n,
      epochToProve,
      prover: EthAddress.random(),
      validUntilSlot: 100n,
    });
    return new EpochProofQuote(payload, Signature.random());
  };

  it('returns high tolerance error if epoch to prove is not current or previous epoch', async () => {
    // Create an epoch proof quote for epoch 5
    const mockQuote = makeEpochProofQuote(5n);

    // Mock epoch cache to return different epoch
    (epochCache.getEpochAndSlotNow as jest.Mock).mockReturnValue({
      epoch: 7n,
    });

    const result = await validator.validate(mockQuote);
    expect(result).toBe(PeerErrorSeverity.HighToleranceError);
  });

  it('returns no error if epoch to prove is current epoch', async () => {
    // Create an epoch proof quote for current epoch
    const mockQuote = makeEpochProofQuote(7n);

    // Mock epoch cache to return matching epoch
    (epochCache.getEpochAndSlotNow as jest.Mock).mockReturnValue({
      epoch: 7n,
    });

    const result = await validator.validate(mockQuote);
    expect(result).toBeUndefined();
  });

  it('returns no error if epoch to prove is previous epoch', async () => {
    // Create an epoch proof quote for previous epoch
    const mockQuote = makeEpochProofQuote(6n);

    // Mock epoch cache to return current epoch
    (epochCache.getEpochAndSlotNow as jest.Mock).mockReturnValue({
      epoch: 7n,
    });

    const result = await validator.validate(mockQuote);
    expect(result).toBeUndefined();
  });
});
