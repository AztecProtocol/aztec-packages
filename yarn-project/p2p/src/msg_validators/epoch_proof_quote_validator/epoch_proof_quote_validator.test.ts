import {
  EpochProofQuote,
  EpochProofQuoteHasher,
  EpochProofQuotePayload,
  PeerErrorSeverity,
} from '@aztec/circuit-types';
import { type EpochCache } from '@aztec/epoch-cache';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { EthAddress } from '@aztec/foundation/eth-address';

import { mock } from 'jest-mock-extended';

import { EpochProofQuoteValidator } from './epoch_proof_quote_validator.js';

describe('EpochProofQuoteValidator', () => {
  let epochCache: EpochCache;
  let validator: EpochProofQuoteValidator;
  let epochProofQuoteHasher: EpochProofQuoteHasher;
  let signer: Secp256k1Signer;

  beforeEach(() => {
    epochCache = mock<EpochCache>();
    epochProofQuoteHasher = new EpochProofQuoteHasher(EthAddress.random(), 1, 1);
    signer = Secp256k1Signer.random();
    validator = new EpochProofQuoteValidator(epochCache, epochProofQuoteHasher);
  });

  const makeEpochProofQuote = (epochToProve: bigint, signer: Secp256k1Signer) => {
    const payload = EpochProofQuotePayload.from({
      basisPointFee: 5000,
      bondAmount: 1000000000000000000n,
      epochToProve,
      prover: signer.address,
      validUntilSlot: 100n,
    });
    return EpochProofQuote.new(epochProofQuoteHasher, payload, signer);
  };

  it('returns high tolerance error if epoch to prove is not current or previous epoch', async () => {
    // Create an epoch proof quote for epoch 5
    const mockQuote = makeEpochProofQuote(5n, signer);

    // Mock epoch cache to return different epoch
    (epochCache.getEpochAndSlotNow as jest.Mock).mockReturnValue({
      epoch: 7n,
    });

    const result = await validator.validate(mockQuote);
    expect(result).toBe(PeerErrorSeverity.HighToleranceError);
  });

  it('returns no error if epoch to prove is current epoch', async () => {
    // Create an epoch proof quote for current epoch
    const mockQuote = makeEpochProofQuote(7n, signer);

    // Mock epoch cache to return matching epoch
    (epochCache.getEpochAndSlotNow as jest.Mock).mockReturnValue({
      epoch: 7n,
    });

    const result = await validator.validate(mockQuote);
    expect(result).toBeUndefined();
  });

  it('returns no error if epoch to prove is previous epoch', async () => {
    // Create an epoch proof quote for previous epoch
    const mockQuote = makeEpochProofQuote(6n, signer);

    // Mock epoch cache to return current epoch
    (epochCache.getEpochAndSlotNow as jest.Mock).mockReturnValue({
      epoch: 7n,
    });

    const result = await validator.validate(mockQuote);
    expect(result).toBeUndefined();
  });
});
