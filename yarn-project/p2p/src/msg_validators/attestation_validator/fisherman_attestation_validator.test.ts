import type { EpochCache } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import {
  makeBlockHeader,
  makeCheckpointAttestation,
  makeCheckpointHeader,
  makeCheckpointProposal,
} from '@aztec/stdlib/testing';
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
      const header = CheckpointHeader.random({ slotNumber: SlotNumber(97) });
      const mockAttestation = makeCheckpointAttestation({
        header,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Mock epoch cache to return different slot numbers
      epochCache.getCurrentAndNextSlot.mockReturnValue({
        currentSlot: SlotNumber(98),
        nextSlot: SlotNumber(99),
      });
      epochCache.isInCommittee.mockResolvedValue(true);

      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.HighToleranceError);

      // Should not check attestation pool if base validation fails
      expect(attestationPool.getCheckpointProposal).not.toHaveBeenCalled();
      // Should not try to resolve proposers if base validation fails
      expect(epochCache.getProposerAttesterAddressInSlot).not.toHaveBeenCalled();
    });

    it('returns high tolerance error if attester is not in committee', async () => {
      const mockAttestation = makeCheckpointAttestation({
        header: CheckpointHeader.random({ slotNumber: SlotNumber(100) }),
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      epochCache.getCurrentAndNextSlot.mockReturnValue({
        currentSlot: SlotNumber(100),
        nextSlot: SlotNumber(101),
      });
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);
      epochCache.isInCommittee.mockResolvedValue(false);

      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.HighToleranceError);

      // Should not check attestation pool if base validation fails
      expect(attestationPool.getCheckpointProposal).not.toHaveBeenCalled();
    });

    it('returns high tolerance error if proposer signature is invalid', async () => {
      const wrongProposer = Secp256k1Signer.random();
      const mockAttestation = makeCheckpointAttestation({
        header: CheckpointHeader.random({ slotNumber: SlotNumber(100) }),
        attesterSigner: attester,
        proposerSigner: wrongProposer,
      });

      epochCache.getCurrentAndNextSlot.mockReturnValue({
        currentSlot: SlotNumber(100),
        nextSlot: SlotNumber(101),
      });
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);
      epochCache.isInCommittee.mockResolvedValue(true);

      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.HighToleranceError);

      // Should not check attestation pool if base validation fails
      expect(attestationPool.getCheckpointProposal).not.toHaveBeenCalled();
    });
  });

  describe('fisherman payload validation', () => {
    beforeEach(() => {
      // Setup valid base validation for all fisherman tests
      epochCache.getCurrentAndNextSlot.mockReturnValue({
        currentSlot: SlotNumber(100),
        nextSlot: SlotNumber(101),
      });
      epochCache.isInCommittee.mockResolvedValue(true);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);
    });

    it('returns undefined if attestation payload matches proposal payload', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: SlotNumber(100) });
      const blockHeader = makeBlockHeader(1);
      const archive = Fr.random();
      const mockAttestation = makeCheckpointAttestation({
        header: checkpointHeader,
        attesterSigner: attester,
        proposerSigner: proposer,
        archive,
      });

      // Create a matching checkpoint proposal with the same payload
      const mockProposal = await makeCheckpointProposal({
        checkpointHeader,
        signer: proposer,
        archiveRoot: archive,
        lastBlock: { blockHeader },
      });

      attestationPool.getCheckpointProposal.mockResolvedValue(mockProposal);

      const result = await validator.validate(mockAttestation);
      expect(result).toBeUndefined();

      // Should have checked the proposal
      expect(attestationPool.getCheckpointProposal).toHaveBeenCalledWith(mockAttestation.archive.toString());
    });

    it('returns low tolerance error if attestation payload does not match proposal payload', async () => {
      const checkpointHeader1 = makeCheckpointHeader(1, { slotNumber: SlotNumber(100) });
      const checkpointHeader2 = makeCheckpointHeader(2, { slotNumber: SlotNumber(100) }); // Different seed = different header
      const blockHeader2 = makeBlockHeader(2);

      const mockAttestation = makeCheckpointAttestation({
        header: checkpointHeader1,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Create a proposal with a different payload
      const mockProposal = await makeCheckpointProposal({
        checkpointHeader: checkpointHeader2,
        signer: proposer,
        lastBlock: { blockHeader: blockHeader2 },
      });

      attestationPool.getCheckpointProposal.mockResolvedValue(mockProposal);

      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.LowToleranceError);

      // Should have checked the proposal
      expect(attestationPool.getCheckpointProposal).toHaveBeenCalledWith(mockAttestation.archive.toString());
    });

    it('returns undefined if proposal is not found yet (attestation arrived before proposal)', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: SlotNumber(100) });
      const mockAttestation = makeCheckpointAttestation({
        header: checkpointHeader,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Proposal not found in pool yet
      attestationPool.getCheckpointProposal.mockResolvedValue(undefined);

      const result = await validator.validate(mockAttestation);
      expect(result).toBeUndefined();

      // Should have tried to check the proposal
      expect(attestationPool.getCheckpointProposal).toHaveBeenCalledWith(mockAttestation.archive.toString());
    });

    it('detects payload mismatch with different archive roots', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: SlotNumber(100) });
      const blockHeader = makeBlockHeader(1);
      const mockAttestation = makeCheckpointAttestation({
        header: checkpointHeader,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Create a proposal with the same header but different archive
      const mockProposal = await makeCheckpointProposal({
        checkpointHeader,
        signer: proposer,
        archiveRoot: Fr.random(), // Different archive
        lastBlock: { blockHeader },
      });

      attestationPool.getCheckpointProposal.mockResolvedValue(mockProposal);

      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.LowToleranceError);
    });

    it('detects payload mismatch with different header hash', async () => {
      const checkpointHeader1 = makeCheckpointHeader(1, { slotNumber: SlotNumber(100) });
      const checkpointHeader2 = makeCheckpointHeader(2, { slotNumber: SlotNumber(100) }); // Same slot but different content
      const blockHeader2 = makeBlockHeader(2);

      const mockAttestation = makeCheckpointAttestation({
        header: checkpointHeader1,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Create a proposal with a different header (different hash)
      const mockProposal = await makeCheckpointProposal({
        checkpointHeader: checkpointHeader2,
        signer: proposer,
        lastBlock: { blockHeader: blockHeader2 },
      });

      attestationPool.getCheckpointProposal.mockResolvedValue(mockProposal);

      // Headers are different, so payloads should be different
      const result = await validator.validate(mockAttestation);
      expect(result).toBe(PeerErrorSeverity.LowToleranceError);
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      // Setup valid base validation
      epochCache.getCurrentAndNextSlot.mockReturnValue({
        currentSlot: SlotNumber(100),
        nextSlot: SlotNumber(101),
      });
      epochCache.isInCommittee.mockResolvedValue(true);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);
    });

    it('handles attestation pool errors gracefully', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: SlotNumber(100) });
      const mockAttestation = makeCheckpointAttestation({
        header: checkpointHeader,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      // Simulate pool throwing an error
      attestationPool.getCheckpointProposal.mockRejectedValue(new Error('Pool error'));

      await expect(validator.validate(mockAttestation)).rejects.toThrow('Pool error');
    });
  });
});
