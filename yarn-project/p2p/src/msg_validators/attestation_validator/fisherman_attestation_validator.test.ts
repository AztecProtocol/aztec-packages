import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { Fr } from '@aztec/foundation/curves/bn254';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import {
  TEST_COORDINATION_SIGNATURE_CONTEXT,
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
  let epochCache: MockProxy<EpochCacheInterface>;
  let attestationPool: MockProxy<AttestationPool>;
  let validator: FishermanAttestationValidator;
  let proposer: Secp256k1Signer;
  let attester: Secp256k1Signer;

  beforeEach(() => {
    epochCache = mock<EpochCacheInterface>();
    epochCache.getL1Constants.mockReturnValue({
      l1GenesisTime: 0n,
      slotDuration: 72,
      ethereumSlotDuration: 12,
    } as any);
    attestationPool = mock<AttestationPool>();
    validator = new FishermanAttestationValidator(epochCache, attestationPool, getTelemetryClient(), {
      blockDurationMs: 6000,
      signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
    });
    proposer = Secp256k1Signer.random();
    attester = Secp256k1Signer.random();
  });

  describe('base validation', () => {
    it('returns high tolerance error if slot number is not current or next slot (outside clock tolerance)', async () => {
      const header = CheckpointHeader.random({ slotNumber: SlotNumber(97) });
      const mockAttestation = makeCheckpointAttestation({
        header,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: SlotNumber(98),
        nextSlot: SlotNumber(99),
      });
      epochCache.getTargetSlot.mockReturnValue(SlotNumber(98));
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(98),
        ts: 7033n,
        nowMs: 7033_000n, // past slot 97's attestation deadline (7032s) + disparity
      });
      epochCache.isInCommittee.mockResolvedValue(true);

      const result = await validator.validate(mockAttestation);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });

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

      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: SlotNumber(100),
        nextSlot: SlotNumber(101),
      });
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);
      epochCache.isInCommittee.mockResolvedValue(false);

      const result = await validator.validate(mockAttestation);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });

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

      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: SlotNumber(100),
        nextSlot: SlotNumber(101),
      });
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);
      epochCache.isInCommittee.mockResolvedValue(true);

      const result = await validator.validate(mockAttestation);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });

      // Should not check attestation pool if base validation fails
      expect(attestationPool.getCheckpointProposal).not.toHaveBeenCalled();
    });
  });

  describe('fisherman payload validation', () => {
    beforeEach(() => {
      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: SlotNumber(100),
        nextSlot: SlotNumber(101),
      });
      epochCache.isInCommittee.mockResolvedValue(true);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);
    });

    it('returns accept if attestation payload matches proposal payload', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: SlotNumber(100) });
      const blockHeader = makeBlockHeader(1);
      const archive = Fr.random();
      const mockAttestation = makeCheckpointAttestation({
        header: checkpointHeader,
        attesterSigner: attester,
        proposerSigner: proposer,
        archive,
      });

      const mockProposal = await makeCheckpointProposal({
        checkpointHeader,
        signer: proposer,
        archiveRoot: archive,
        lastBlock: { blockHeader },
      });

      attestationPool.getCheckpointProposal.mockResolvedValue(mockProposal);

      const result = await validator.validate(mockAttestation);
      expect(result).toEqual({ result: 'accept' });

      expect(attestationPool.getCheckpointProposal).toHaveBeenCalledWith(mockAttestation.payload.header.slotNumber);
    });

    it('returns low tolerance error if attestation payload does not match proposal payload', async () => {
      const checkpointHeader1 = makeCheckpointHeader(1, { slotNumber: SlotNumber(100) });
      const checkpointHeader2 = makeCheckpointHeader(2, { slotNumber: SlotNumber(100) });
      const blockHeader2 = makeBlockHeader(2);

      const mockAttestation = makeCheckpointAttestation({
        header: checkpointHeader1,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      const mockProposal = await makeCheckpointProposal({
        checkpointHeader: checkpointHeader2,
        signer: proposer,
        lastBlock: { blockHeader: blockHeader2 },
      });

      attestationPool.getCheckpointProposal.mockResolvedValue(mockProposal);

      const result = await validator.validate(mockAttestation);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.LowToleranceError });

      expect(attestationPool.getCheckpointProposal).toHaveBeenCalledWith(mockAttestation.payload.header.slotNumber);
    });

    it('returns accept if proposal is not found yet (attestation arrived before proposal)', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: SlotNumber(100) });
      const mockAttestation = makeCheckpointAttestation({
        header: checkpointHeader,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      attestationPool.getCheckpointProposal.mockResolvedValue(undefined);

      const result = await validator.validate(mockAttestation);
      expect(result).toEqual({ result: 'accept' });

      expect(attestationPool.getCheckpointProposal).toHaveBeenCalledWith(mockAttestation.payload.header.slotNumber);
    });

    it('detects payload mismatch with different archive roots', async () => {
      const checkpointHeader = makeCheckpointHeader(1, { slotNumber: SlotNumber(100) });
      const blockHeader = makeBlockHeader(1);
      const mockAttestation = makeCheckpointAttestation({
        header: checkpointHeader,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      const mockProposal = await makeCheckpointProposal({
        checkpointHeader,
        signer: proposer,
        archiveRoot: Fr.random(),
        lastBlock: { blockHeader },
      });

      attestationPool.getCheckpointProposal.mockResolvedValue(mockProposal);

      const result = await validator.validate(mockAttestation);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.LowToleranceError });
    });

    it('detects payload mismatch with different header hash', async () => {
      const checkpointHeader1 = makeCheckpointHeader(1, { slotNumber: SlotNumber(100) });
      const checkpointHeader2 = makeCheckpointHeader(2, { slotNumber: SlotNumber(100) });
      const blockHeader2 = makeBlockHeader(2);

      const mockAttestation = makeCheckpointAttestation({
        header: checkpointHeader1,
        attesterSigner: attester,
        proposerSigner: proposer,
      });

      const mockProposal = await makeCheckpointProposal({
        checkpointHeader: checkpointHeader2,
        signer: proposer,
        lastBlock: { blockHeader: blockHeader2 },
      });

      attestationPool.getCheckpointProposal.mockResolvedValue(mockProposal);

      const result = await validator.validate(mockAttestation);
      expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.LowToleranceError });
    });
  });

  describe('edge cases', () => {
    beforeEach(() => {
      epochCache.getTargetAndNextSlot.mockReturnValue({
        targetSlot: SlotNumber(100),
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

      attestationPool.getCheckpointProposal.mockRejectedValue(new Error('Pool error'));

      await expect(validator.validate(mockAttestation)).rejects.toThrow('Pool error');
    });
  });
});
