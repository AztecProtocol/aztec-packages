import type { EpochCache } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { makeCheckpointAttestation } from '@aztec/stdlib/testing';

import { mock } from 'jest-mock-extended';

import { CheckpointAttestationValidator } from './attestation_validator.js';

describe('CheckpointAttestationValidator', () => {
  let epochCache: EpochCache;
  let validator: CheckpointAttestationValidator;
  let proposer: Secp256k1Signer;
  let attester: Secp256k1Signer;

  beforeEach(() => {
    epochCache = mock<EpochCache>();
    validator = new CheckpointAttestationValidator(epochCache);
    proposer = Secp256k1Signer.random();
    attester = Secp256k1Signer.random();
  });

  it('returns high tolerance error if slot number is not current or next slot (outside clock tolerance)', async () => {
    // Create an attestation for slot 97 (previous slot)
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(97) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    // Mock epoch cache to return different slot numbers
    (epochCache.getCurrentAndNextSlot as jest.Mock).mockReturnValue({
      currentSlot: SlotNumber(98),
      nextSlot: SlotNumber(99),
    });
    // Mock getEpochAndSlotNow to return time OUTSIDE clock tolerance (1000ms elapsed)
    (epochCache.getEpochAndSlotNow as jest.Mock).mockReturnValue({
      epoch: 1,
      slot: SlotNumber(98),
      ts: 1000n, // slot started at 1000 seconds
      nowMs: 1001000n, // 1000ms elapsed, outside 500ms tolerance
    });
    (epochCache.isInCommittee as jest.Mock).mockResolvedValue(true);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
  });

  it('returns ignore if previous slot attestation is within clock tolerance', async () => {
    // Create an attestation for slot 97 (previous slot)
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(97) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    // Mock epoch cache - attestation is for previous slot (97) when current is 98
    (epochCache.getCurrentAndNextSlot as jest.Mock).mockReturnValue({
      currentSlot: SlotNumber(98),
      nextSlot: SlotNumber(99),
    });
    // Mock getEpochAndSlotNow to return time WITHIN clock tolerance (100ms elapsed)
    (epochCache.getEpochAndSlotNow as jest.Mock).mockReturnValue({
      epoch: 1,
      slot: SlotNumber(98),
      ts: 1000n, // slot started at 1000 seconds
      nowMs: 1000100n, // 100ms elapsed, within 500ms tolerance
    });
    (epochCache.isInCommittee as jest.Mock).mockResolvedValue(true);
    (epochCache.getProposerAttesterAddressInSlot as jest.Mock).mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'ignore' });
  });

  it('returns high tolerance error if attester is not in committee', async () => {
    // The slot is correct, but the attester is not in the committee
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(100) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    // Mock epoch cache to return matching slot number but invalid committee membership
    (epochCache.getCurrentAndNextSlot as jest.Mock).mockReturnValue({
      currentSlot: SlotNumber(100),
      nextSlot: SlotNumber(101),
    });
    (epochCache.isInCommittee as jest.Mock).mockResolvedValue(false);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
  });

  it('returns undefined if checkpoint attestation is valid (current slot)', async () => {
    // Create an attestation for slot 100
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(100) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    // Mock epoch cache for valid case with current slot
    (epochCache.getCurrentAndNextSlot as jest.Mock).mockReturnValue({
      currentSlot: SlotNumber(100),
      nextSlot: SlotNumber(101),
    });
    (epochCache.isInCommittee as jest.Mock).mockResolvedValue(true);
    (epochCache.getProposerAttesterAddressInSlot as jest.Mock).mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'accept' });
  });

  it('returns undefined if checkpoint attestation is valid (next slot)', async () => {
    // Setup attestation for next slot
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(101) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    // Mock epoch cache for valid case with next slot
    (epochCache.getCurrentAndNextSlot as jest.Mock).mockReturnValue({
      currentSlot: SlotNumber(100),
      nextSlot: SlotNumber(101),
    });
    (epochCache.isInCommittee as jest.Mock).mockResolvedValue(true);
    (epochCache.getProposerAttesterAddressInSlot as jest.Mock).mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'accept' });
  });

  it('returns high tolerance error if proposer signature is invalid', async () => {
    const wrongProposer = Secp256k1Signer.random();
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(100) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: wrongProposer,
    });

    // Mock epoch cache with different proposer
    (epochCache.getCurrentAndNextSlot as jest.Mock).mockReturnValue({
      currentSlot: SlotNumber(100),
      nextSlot: SlotNumber(101),
    });
    (epochCache.isInCommittee as jest.Mock).mockResolvedValue(true);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
  });

  it('returns low tolerance error if no committee exists', async () => {
    // Create an attestation
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(100) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    // Mock epoch cache to throw NoCommitteeError
    (epochCache.getCurrentAndNextSlot as jest.Mock).mockReturnValue({
      currentSlot: SlotNumber(100),
      nextSlot: SlotNumber(101),
    });
    (epochCache.isInCommittee as jest.Mock).mockReturnValue(true);
    (epochCache.getProposerAttesterAddressInSlot as jest.Mock).mockRejectedValue(new NoCommitteeError());

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.LowToleranceError });
  });
});
