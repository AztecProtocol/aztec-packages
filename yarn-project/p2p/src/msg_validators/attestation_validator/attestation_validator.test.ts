import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { TEST_COORDINATION_SIGNATURE_CONTEXT, makeCheckpointAttestation } from '@aztec/stdlib/testing';

import { type MockProxy, mock } from 'jest-mock-extended';

import { CheckpointAttestationValidator } from './attestation_validator.js';

describe('CheckpointAttestationValidator', () => {
  let epochCache: MockProxy<EpochCacheInterface>;
  let validator: CheckpointAttestationValidator;
  let proposer: Secp256k1Signer;
  let attester: Secp256k1Signer;

  beforeEach(() => {
    epochCache = mock<EpochCacheInterface>();
    epochCache.getL1Constants.mockReturnValue({
      l1GenesisTime: 0n,
      slotDuration: 72,
      ethereumSlotDuration: 12,
    } as any);
    validator = new CheckpointAttestationValidator(epochCache, {
      blockDurationMs: 6000,
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

  it('returns high tolerance error if slot number is not current or next slot and outside its receive window', async () => {
    // Attestation for slot 97 (target 98). Slot 97 attestation deadline = 97*72 + 48 = 7032s; set now
    // just past it so the message falls outside its liberal receive window.
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
  });

  it('accepts a previous-slot attestation that is still within its receive window', async () => {
    // Attestation for slot 97 (target 98). Slot 97 build frame opens at 97*72 - 84 = 6900s; now is
    // shortly after, well within slot 97's liberal attestation window, so it falls through and accepts.
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
      ts: 6905n,
      nowMs: 6905_000n, // within slot 97's window [6900, 7032]
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'accept' });
  });

  it('accepts attestation for current slot inside the straggler window', async () => {
    // Attestation is for slot 98 (current wallclock slot), but targetSlot is 99 (pipelining). Slot 98's
    // liberal attestation window is [98*72-84, 98*72+48] = [6972, 7104]s; now sits comfortably inside.
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
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(98),
      ts: 6980n,
      nowMs: 6980_000n, // within slot 98's window [6972, 7104]
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'accept' });
  });

  it('accepts attestation arriving well into the target slot (liberal window)', async () => {
    // Slot 98 attestation; now is 30s past target_slot_start(98)=7056 ⇒ 7086s, still within [6972, 7104].
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
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(98),
      ts: 7086n,
      nowMs: 7086_000n,
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'accept' });
  });

  it('rejects attestation for current slot past the straggler window', async () => {
    // Slot 98 attestation; now is past slot 98's attestation deadline (7104s) + disparity.
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
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(98),
      ts: 7105n,
      nowMs: 7105_000n, // past slot 98's attestation deadline (7104s) + disparity
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
