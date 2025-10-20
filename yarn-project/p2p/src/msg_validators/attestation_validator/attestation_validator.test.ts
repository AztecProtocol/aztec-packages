import type { EpochCache } from '@aztec/epoch-cache';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { makeBlockAttestation, makeL2BlockHeader } from '@aztec/stdlib/testing';

import { mock } from 'jest-mock-extended';

import { AttestationValidator } from './attestation_validator.js';

describe('AttestationValidator', () => {
  let epochCache: EpochCache;
  let validator: AttestationValidator;
  let proposer: Secp256k1Signer;
  let attester: Secp256k1Signer;

  beforeEach(() => {
    epochCache = mock<EpochCache>();
    validator = new AttestationValidator(epochCache);
    proposer = Secp256k1Signer.random();
    attester = Secp256k1Signer.random();
  });

  it('returns high tolerance error if slot number is not current or next slot', async () => {
    // Create an attestation for slot 97
    const header = makeL2BlockHeader(1, 97, 97);
    const mockAttestation = makeBlockAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    // Mock epoch cache to return different slot numbers
    (epochCache.getProposerAttesterAddressInCurrentOrNextSlot as jest.Mock).mockResolvedValue({
      currentProposer: proposer.address,
      nextProposer: proposer.address,
      currentSlot: 98n,
      nextSlot: 99n,
    });
    (epochCache.isInCommittee as jest.Mock).mockResolvedValue(true);

    const result = await validator.validate(mockAttestation);
    expect(result).toBe(PeerErrorSeverity.HighToleranceError);
  });

  it('returns high tolerance error if attester is not in committee', async () => {
    // The slot is correct, but the attester is not in the committee
    const mockAttestation = makeBlockAttestation({
      header: makeL2BlockHeader(1, 100, 100),
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    // Mock epoch cache to return matching slot number but invalid committee membership
    (epochCache.getProposerAttesterAddressInCurrentOrNextSlot as jest.Mock).mockResolvedValue({
      currentProposer: proposer.address,
      nextProposer: proposer.address,
      currentSlot: 100n,
      nextSlot: 101n,
    });
    (epochCache.isInCommittee as jest.Mock).mockResolvedValue(false);

    const result = await validator.validate(mockAttestation);
    expect(result).toBe(PeerErrorSeverity.HighToleranceError);
  });

  it('returns undefined if attestation is valid (current slot)', async () => {
    // Create an attestation for slot 100
    const mockAttestation = makeBlockAttestation({
      header: makeL2BlockHeader(1, 100, 100),
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    // Mock epoch cache for valid case with current slot
    (epochCache.getProposerAttesterAddressInCurrentOrNextSlot as jest.Mock).mockResolvedValue({
      currentProposer: proposer.address,
      nextProposer: proposer.address,
      currentSlot: 100n,
      nextSlot: 101n,
    });
    (epochCache.isInCommittee as jest.Mock).mockResolvedValue(true);

    const result = await validator.validate(mockAttestation);
    expect(result).toBeUndefined();
  });

  it('returns undefined if attestation is valid (next slot)', async () => {
    // Setup attestation for next slot
    const mockAttestation = makeBlockAttestation({
      header: makeL2BlockHeader(1, 101, 101),
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    // Mock epoch cache for valid case with next slot
    (epochCache.getProposerAttesterAddressInCurrentOrNextSlot as jest.Mock).mockResolvedValue({
      currentProposer: proposer.address,
      nextProposer: proposer.address,
      currentSlot: 100n,
      nextSlot: 101n,
    });
    (epochCache.isInCommittee as jest.Mock).mockResolvedValue(true);

    const result = await validator.validate(mockAttestation);
    expect(result).toBeUndefined();
  });

  it('returns high tolerance error if proposer signature is invalid', async () => {
    const wrongProposer = Secp256k1Signer.random();
    const mockAttestation = makeBlockAttestation({
      header: makeL2BlockHeader(1, 100, 100),
      attesterSigner: attester,
      proposerSigner: wrongProposer,
    });

    // Mock epoch cache with different proposer
    (epochCache.getProposerAttesterAddressInCurrentOrNextSlot as jest.Mock).mockResolvedValue({
      currentProposer: proposer.address,
      nextProposer: proposer.address,
      currentSlot: 100n,
      nextSlot: 101n,
    });
    (epochCache.isInCommittee as jest.Mock).mockResolvedValue(true);

    const result = await validator.validate(mockAttestation);
    expect(result).toBe(PeerErrorSeverity.HighToleranceError);
  });
});
