import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { TEST_COORDINATION_SIGNATURE_CONTEXT, makeCheckpointAttestation } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';

import { PeerErrorSeverity } from '../../types/index.js';
import { CheckpointAttestationValidator } from './attestation_validator.js';

describe('CheckpointAttestationValidator', () => {
  let epochCache: MockProxy<EpochCacheInterface>;
  let validator: CheckpointAttestationValidator;
  let proposer: Secp256k1Signer;
  let attester: Secp256k1Signer;

  beforeEach(() => {
    epochCache = mock<EpochCacheInterface>();
    epochCache.getL1Constants.mockReturnValue({
      slotDuration: 72,
      ethereumSlotDuration: 12,
    } as any);
    validator = new CheckpointAttestationValidator(epochCache, {
      l1PublishingTime: 12,
      signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
    });
    proposer = Secp256k1Signer.random();
    attester = Secp256k1Signer.random();
  });

  it('rejects foreign signature context with low tolerance error', async () => {
    const mockAttestation = makeCheckpointAttestation({
      attesterSigner: attester,
      proposerSigner: proposer,
      signatureContext: {
        ...TEST_COORDINATION_SIGNATURE_CONTEXT,
        chainId: TEST_COORDINATION_SIGNATURE_CONTEXT.chainId + 1,
      },
    });

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.LowToleranceError });
  });

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
      ts: 1000n,
      nowMs: 1001000n, // 1000ms elapsed, outside 500ms tolerance
    });
    epochCache.isInCommittee.mockResolvedValue(true);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
  });

  it('returns ignore if previous slot attestation is within clock tolerance', async () => {
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
      ts: 1000n,
      nowMs: 1000100n, // 100ms elapsed, within 500ms tolerance
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'ignore' });
  });

  it('accepts attestation for current slot inside the straggler window', async () => {
    // Attestation is for slot 98 (current wallclock slot), but targetSlot is 99 (pipelining).
    // attestationWindowIntoTargetSlot now spans target-slot start to the L1 publish deadline:
    // aztecSlotDuration - 2*ethereumSlotDuration = 72 - 24 = 48s ⇒ straggler grace 48s+500ms.
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(98) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    epochCache.getTargetAndNextSlot.mockReturnValue({
      targetSlot: SlotNumber(99),
      nextSlot: SlotNumber(100),
    });
    epochCache.getSlotNow.mockReturnValue(SlotNumber(98));
    epochCache.getL1Constants.mockReturnValue({
      slotDuration: 72,
      ethereumSlotDuration: 12,
    } as any);

    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(98),
      ts: 1000n,
      nowMs: 1003000n, // 3000ms elapsed, within 48500ms straggler grace
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'accept' });
  });

  it('accepts attestation arriving well into the target slot (previously rejected past ~4.5s)', async () => {
    // 30s into the target slot — past the old 4.5s window, well within the new 48.5s window.
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(98) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    epochCache.getTargetAndNextSlot.mockReturnValue({
      targetSlot: SlotNumber(99),
      nextSlot: SlotNumber(100),
    });
    epochCache.getSlotNow.mockReturnValue(SlotNumber(98));
    epochCache.getL1Constants.mockReturnValue({
      slotDuration: 72,
      ethereumSlotDuration: 12,
    } as any);

    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(98),
      ts: 1000n,
      nowMs: 1030000n, // 30s elapsed — accepted now, would have been rejected pre-fix
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'accept' });
  });

  it('rejects attestation for current slot past the straggler window', async () => {
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(98) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    epochCache.getTargetAndNextSlot.mockReturnValue({
      targetSlot: SlotNumber(99),
      nextSlot: SlotNumber(100),
    });
    epochCache.getTargetSlot.mockReturnValue(SlotNumber(99));
    epochCache.getSlotNow.mockReturnValue(SlotNumber(98));
    epochCache.getL1Constants.mockReturnValue({
      slotDuration: 72,
      ethereumSlotDuration: 12,
    } as any);

    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(99),
      ts: 1000n,
      nowMs: 1049000n, // 49s elapsed, past the 48.5s straggler cutoff (48s window + 500ms disparity)
    });
    epochCache.isInCommittee.mockResolvedValue(true);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
  });

  it('returns high tolerance error if attester is not in committee', async () => {
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(100) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    epochCache.getTargetAndNextSlot.mockReturnValue({
      targetSlot: SlotNumber(100),
      nextSlot: SlotNumber(101),
    });
    epochCache.isInCommittee.mockResolvedValue(false);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
  });

  it('returns accept if checkpoint attestation is valid (current slot)', async () => {
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(100) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    epochCache.getTargetAndNextSlot.mockReturnValue({
      targetSlot: SlotNumber(100),
      nextSlot: SlotNumber(101),
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'accept' });
  });

  it('returns accept if checkpoint attestation is valid (next slot)', async () => {
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(101) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    epochCache.getTargetAndNextSlot.mockReturnValue({
      targetSlot: SlotNumber(100),
      nextSlot: SlotNumber(101),
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);

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

    epochCache.getTargetAndNextSlot.mockReturnValue({
      targetSlot: SlotNumber(100),
      nextSlot: SlotNumber(101),
    });
    epochCache.isInCommittee.mockResolvedValue(true);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
  });

  it('returns low tolerance error if no committee exists', async () => {
    const header = CheckpointHeader.random({ slotNumber: SlotNumber(100) });
    const mockAttestation = makeCheckpointAttestation({
      header,
      attesterSigner: attester,
      proposerSigner: proposer,
    });

    epochCache.getTargetAndNextSlot.mockReturnValue({
      targetSlot: SlotNumber(100),
      nextSlot: SlotNumber(101),
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockRejectedValue(new NoCommitteeError());

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.LowToleranceError });
  });
});
