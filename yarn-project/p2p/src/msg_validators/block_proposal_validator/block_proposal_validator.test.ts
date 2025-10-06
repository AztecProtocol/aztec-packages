import type { EpochCache } from '@aztec/epoch-cache';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { makeBlockProposal, makeL2BlockHeader } from '@aztec/stdlib/testing';

import { mock } from 'jest-mock-extended';

import { BlockProposalValidator } from './block_proposal_validator.js';

describe('BlockProposalValidator', () => {
  let epochCache: EpochCache;
  let validator: BlockProposalValidator;

  beforeEach(() => {
    epochCache = mock<EpochCache>();
    validator = new BlockProposalValidator(epochCache);
  });

  it('returns high tolerance error if slot number is not current or next slot', async () => {
    // Create a block proposal for slot 97
    const mockProposal = makeBlockProposal({
      header: makeL2BlockHeader(1, 97, 97),
    });

    // Mock epoch cache to return different slot numbers
    (epochCache.getProposerAttesterAddressInCurrentOrNextSlot as jest.Mock).mockResolvedValue({
      currentSlot: 98n,
      nextSlot: 99n,
      currentProposer: Fr.random(),
      nextProposer: Fr.random(),
    });

    const result = await validator.validate(mockProposal);
    expect(result).toBe(PeerErrorSeverity.HighToleranceError);
  });

  it('returns mid tolerance error if proposer is not current proposer for current slot', async () => {
    const currentProposer = Secp256k1Signer.random();
    const nextProposer = Secp256k1Signer.random();
    const invalidProposer = Secp256k1Signer.random();

    // Create a block proposal for current slot but with wrong proposer
    const mockProposal = makeBlockProposal({
      header: makeL2BlockHeader(1, 100, 100),
      signer: invalidProposer,
    });

    // Mock epoch cache to return valid slots but different proposers
    (epochCache.getProposerAttesterAddressInCurrentOrNextSlot as jest.Mock).mockResolvedValue({
      currentSlot: 100n,
      nextSlot: 101n,
      currentProposer: currentProposer.address,
      nextProposer: nextProposer.address,
    });

    const result = await validator.validate(mockProposal);
    expect(result).toBe(PeerErrorSeverity.MidToleranceError);
  });

  it('returns mid tolerance error if proposer is not next proposer for next slot', async () => {
    const currentProposer = Secp256k1Signer.random();
    const nextProposer = Secp256k1Signer.random();
    const invalidProposer = Secp256k1Signer.random();

    // Create a block proposal for next slot but with wrong proposer
    const mockProposal = makeBlockProposal({
      header: makeL2BlockHeader(1, 101, 101),
      signer: invalidProposer,
    });

    // Mock epoch cache to return valid slots but different proposers
    (epochCache.getProposerAttesterAddressInCurrentOrNextSlot as jest.Mock).mockResolvedValue({
      currentSlot: 100n,
      nextSlot: 101n,
      currentProposer: currentProposer.address,
      nextProposer: nextProposer.address,
    });

    const result = await validator.validate(mockProposal);
    expect(result).toBe(PeerErrorSeverity.MidToleranceError);
  });

  it('returns mid tolerance error if proposer is current proposer but proposal is for next slot', async () => {
    const currentProposer = Secp256k1Signer.random();
    const nextProposer = Secp256k1Signer.random();

    // Create a block proposal for next slot but with wrong proposer
    const mockProposal = makeBlockProposal({
      header: makeL2BlockHeader(1, 101, 101),
      signer: currentProposer,
    });

    // Mock epoch cache to return valid slots but different proposers
    (epochCache.getProposerAttesterAddressInCurrentOrNextSlot as jest.Mock).mockResolvedValue({
      currentSlot: 100n,
      nextSlot: 101n,
      currentProposer: currentProposer.address,
      nextProposer: nextProposer.address,
    });

    const result = await validator.validate(mockProposal);
    expect(result).toBe(PeerErrorSeverity.MidToleranceError);
  });

  it('returns undefined if proposal is valid for current slot and proposer', async () => {
    const currentProposer = Secp256k1Signer.random();
    const nextProposer = Secp256k1Signer.random();

    // Create a block proposal for current slot with correct proposer
    const mockProposal = makeBlockProposal({
      header: makeL2BlockHeader(1, 100, 100),
      signer: currentProposer,
    });

    // Mock epoch cache for valid case
    (epochCache.getProposerAttesterAddressInCurrentOrNextSlot as jest.Mock).mockResolvedValue({
      currentSlot: 100n,
      nextSlot: 101n,
      currentProposer: currentProposer.address,
      nextProposer: nextProposer.address,
    });

    const result = await validator.validate(mockProposal);
    expect(result).toBeUndefined();
  });

  it('returns undefined if proposal is valid for next slot and proposer', async () => {
    const currentProposer = Secp256k1Signer.random();
    const nextProposer = Secp256k1Signer.random();

    // Create a block proposal for next slot with correct proposer
    const mockProposal = makeBlockProposal({
      header: makeL2BlockHeader(1, 101, 101),
      signer: nextProposer,
    });

    // Mock epoch cache for valid case
    (epochCache.getProposerAttesterAddressInCurrentOrNextSlot as jest.Mock).mockResolvedValue({
      currentSlot: 100n,
      nextSlot: 101n,
      currentProposer: currentProposer.address,
      nextProposer: nextProposer.address,
    });

    const result = await validator.validate(mockProposal);
    expect(result).toBeUndefined();
  });
});
