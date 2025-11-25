import type { EpochCache } from '@aztec/epoch-cache';
import { Secp256k1Signer } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { BlockProposal, ConsensusPayload, PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { makeBlockAttestation, makeBlockProposal, makeL2BlockHeader } from '@aztec/stdlib/testing';
import { getTelemetryClient } from '@aztec/telemetry-client';

import { type MockProxy, mock } from 'jest-mock-extended';

import type { AttestationPool } from '../../mem_pools/attestation_pool/attestation_pool.js';
import { FishermanAttestationValidator } from './fisherman_attestation_validator.js';

describe('FishermanAttestationValidator', () => {
  let epochCache: MockProxy<EpochCache>;
  let attestationPool: MockProxy<AttestationPool>;
  let validator: FishermanAttestationValidator;
  let proposer: Secp256k1Signer;
  let attester: Secp256k1Signer;

  beforeEach(() => {
    epochCache = mock<EpochCache>();
    attestationPool = mock<AttestationPool>();
    validator = new FishermanAttestationValidator(epochCache, attestationPool, getTelemetryClient());
    proposer = Secp256k1Signer.random();
    attester = Secp256k1Signer.random();
  });

  describe('base validation', () => {
    it('returns high tolerance error if slot number is not current or next slot', async () => {
      // Create an attestation for slot 97
      const header = makeL2BlockHeader(1, 97, 97);
      const mockAttestation = makeBlockAttestation({
        header,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Mock epoch cache to return different slot numbers
      epochCache.getProposerAttesterAddressInCurrentOrNextSlot.mockResolvedValue({
        currentProposer: proposer.address,
        nextProposer: proposer.address,
        currentSlot: 98n,
        nextSlot: 99n,
      });
      epochCache.isInCommittee.mockResolvedValue(true);

      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.HighToleranceError);

      // Should not check attestation pool if base validation fails
      expect(attestationPool.getBlockProposal).not.toHaveBeenCalled();
    });

    it('returns high tolerance error if attester is not in committee', async () => {
      const mockAttestation = makeBlockAttestation({
        header: makeL2BlockHeader(1, 100, 100),
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      epochCache.getProposerAttesterAddressInCurrentOrNextSlot.mockResolvedValue({
        currentProposer: proposer.address,
        nextProposer: proposer.address,
        currentSlot: 100n,
        nextSlot: 101n,
      });
      epochCache.isInCommittee.mockResolvedValue(false);

      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.HighToleranceError);

      // Should not check attestation pool if base validation fails
      expect(attestationPool.getBlockProposal).not.toHaveBeenCalled();
    });

    it('returns high tolerance error if proposer signature is invalid', async () => {
      const wrongProposer = Secp256k1Signer.random();
      const mockAttestation = makeBlockAttestation({
        header: makeL2BlockHeader(1, 100, 100),
        attesterSigner: attester,
        proposerSigner: wrongProposer,
      });

      epochCache.getProposerAttesterAddressInCurrentOrNextSlot.mockResolvedValue({
        currentProposer: proposer.address,
        nextProposer: proposer.address,
        currentSlot: 100n,
        nextSlot: 101n,
      });
      epochCache.isInCommittee.mockResolvedValue(true);

      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.HighToleranceError);

      // Should not check attestation pool if base validation fails
      expect(attestationPool.getBlockProposal).not.toHaveBeenCalled();
    });
  });

  describe('fisherman payload validation', () => {
    beforeEach(() => {
      // Setup valid base validation for all fisherman tests
      epochCache.getProposerAttesterAddressInCurrentOrNextSlot.mockResolvedValue({
        currentProposer: proposer.address,
        nextProposer: proposer.address,
        currentSlot: 100n,
        nextSlot: 101n,
      });
      epochCache.isInCommittee.mockResolvedValue(true);
    });

    it('returns undefined if attestation payload matches proposal payload', async () => {
      const header = makeL2BlockHeader(1, 100, 100);
      const archive = Fr.random();
      const mockAttestation = makeBlockAttestation({
        header,
        attesterSigner: attester,
        proposerSigner: proposer,
        archive,
      });

      // Create a matching proposal with the same payload
      const mockProposal = makeBlockProposal({
        header,
        signer: proposer,
        archive,
      });

      attestationPool.getBlockProposal.mockResolvedValue(mockProposal);

      const result = await validator.validate(mockAttestation);
      expect(result).toBeUndefined();

      // Should have checked the proposal
      expect(attestationPool.getBlockProposal).toHaveBeenCalledWith(mockAttestation.archive.toString());
    });

    it('returns low tolerance error if attestation payload does not match proposal payload', async () => {
      const header1 = makeL2BlockHeader(1, 100, 100);
      const header2 = makeL2BlockHeader(2, 100, 100); // Different block number

      const mockAttestation = makeBlockAttestation({
        header: header1,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Create a proposal with a different payload
      const mockProposal = makeBlockProposal({
        header: header2,
        signer: proposer,
      });

      attestationPool.getBlockProposal.mockResolvedValue(mockProposal);

      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.LowToleranceError);

      // Should have checked the proposal
      expect(attestationPool.getBlockProposal).toHaveBeenCalledWith(mockAttestation.archive.toString());
    });

    it('returns undefined if proposal is not found yet (attestation arrived before proposal)', async () => {
      const header = makeL2BlockHeader(1, 100, 100);
      const mockAttestation = makeBlockAttestation({
        header,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Proposal not found in pool yet
      attestationPool.getBlockProposal.mockResolvedValue(undefined);

      const result = await validator.validate(mockAttestation);
      expect(result).toBeUndefined();

      // Should have tried to check the proposal
      expect(attestationPool.getBlockProposal).toHaveBeenCalledWith(mockAttestation.archive.toString());
    });

    it('detects payload mismatch with different archive roots', async () => {
      const header = makeL2BlockHeader(1, 100, 100);
      const mockAttestation = makeBlockAttestation({
        header,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Create a proposal with the same header but manually create a different payload
      const differentPayload = new ConsensusPayload(
        header.toCheckpointHeader(),
        Fr.random(), // Different archive
        mockAttestation.payload.stateReference,
      );
      const mockProposal = new BlockProposal(differentPayload, mockAttestation.proposerSignature, []);

      attestationPool.getBlockProposal.mockResolvedValue(mockProposal);

      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.LowToleranceError);
    });

    it('detects payload mismatch with different header hash', async () => {
      const header1 = makeL2BlockHeader(1, 100, 100);
      const header2 = makeL2BlockHeader(1, 100, 100); // Same slot but different random content

      const mockAttestation = makeBlockAttestation({
        header: header1,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Create a proposal with a different header (different hash)
      const mockProposal = makeBlockProposal({
        header: header2,
        signer: proposer,
      });

      attestationPool.getBlockProposal.mockResolvedValue(mockProposal);

      // Headers are different, so payloads should be different
      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.LowToleranceError);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      // Setup valid base validation
      epochCache.getProposerAttesterAddressInCurrentOrNextSlot.mockResolvedValue({
        currentProposer: proposer.address,
        nextProposer: proposer.address,
        currentSlot: 100n,
        nextSlot: 101n,
      });
      epochCache.isInCommittee.mockResolvedValue(true);
    });

    it('handles attestation pool errors gracefully', async () => {
      const header = makeL2BlockHeader(1, 100, 100);
      const mockAttestation = makeBlockAttestation({
        header,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Simulate pool throwing an error
      attestationPool.getBlockProposal.mockRejectedValue(new Error('Pool error'));

      await expect(validator.validate(mockAttestation)).rejects.toThrow('Pool error');
    });
  });
});
