import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { NoCommitteeError } from '@aztec/ethereum/contracts';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Secp256k1Signer } from '@aztec/foundation/crypto/secp256k1-signer';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { CheckpointHeader } from '@aztec/stdlib/rollup';
import { TEST_COORDINATION_SIGNATURE_CONTEXT, makeCheckpointAttestation } from '@aztec/stdlib/testing';
import { ConsensusTimetable } from '@aztec/stdlib/timetable';

import { type MockProxy, mock } from 'jest-mock-extended';

import { CheckpointAttestationValidator } from './attestation_validator.js';

/** Clock-disparity tolerance (ms) the validator is configured with in these tests. */
const TEST_CLOCK_DISPARITY_MS = 500;

/** Builds a multi-block timetable (S=72, E=12, D=6) matching the test's mocked l1 constants. */
function makeTimetable() {
  return new ConsensusTimetable({
    l1Constants: { l1GenesisTime: 0n, slotDuration: 72, ethereumSlotDuration: 12 },
    blockDuration: 6,
  });
}

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
    validator = new CheckpointAttestationValidator(epochCache, makeTimetable(), {
      signatureContext: TEST_COORDINATION_SIGNATURE_CONTEXT,
      clockDisparityMs: TEST_CLOCK_DISPARITY_MS,
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

  it('returns high tolerance error if slot number is outside its receive window', async () => {
    // Attestation for slot 97 (target 98). Slot 97 attestation deadline = 97*72 + S - E - lead = 7038s;
    // set now just past it so the message falls outside its liberal receive window.
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
      ts: 7039n,
      nowMs: 7039_000n, // past slot 97's attestation deadline (7038s) + disparity
    });
    epochCache.isInCommittee.mockResolvedValue(true);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.HighToleranceError });
  });

  it('accepts a previous-slot attestation that is still within its receive window', async () => {
    // Attestation for slot 97 (target 98). Slot 97 build frame opens at 97*72 - S - lead = 6906s; now is
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
      ts: 6910n,
      nowMs: 6910_000n, // within slot 97's window [6906, 7038]
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'accept' });
  });

  it('accepts attestation for current slot inside the straggler window', async () => {
    // Attestation is for slot 98 (current wallclock slot), but targetSlot is 99 (pipelining). Slot 98's
    // liberal attestation window is [98*72 - S - lead, 98*72 + S - E - lead] = [6978, 7110]s; now sits
    // comfortably inside.
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
      nowMs: 6980_000n, // within slot 98's window [6978, 7110]
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'accept' });
  });

  it('accepts attestation arriving well into the target slot (liberal window)', async () => {
    // Slot 98 attestation; now is 30s past target_slot_start(98)=7056 ⇒ 7086s, still within [6978, 7110].
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
    // Slot 98 attestation; now is past slot 98's attestation deadline (7110s) + disparity.
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
      ts: 7111n,
      nowMs: 7111_000n, // past slot 98's attestation deadline (7110s) + disparity
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
    // Slot 100 attestation window [7122, 7254]s; now inside so the committee check is reached.
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(100),
      ts: 7150n,
      nowMs: 7150_000n,
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
    // Slot 100 attestation window [7122, 7254]s; now sits inside it.
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(100),
      ts: 7150n,
      nowMs: 7150_000n,
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
    // Slot 101 attestation window [7194, 7326]s; now sits inside it.
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(101),
      ts: 7250n,
      nowMs: 7250_000n,
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
    // Slot 100 attestation window [7122, 7254]s; now inside so the proposer check is reached.
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(100),
      ts: 7150n,
      nowMs: 7150_000n,
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
    // Slot 100 attestation window [7122, 7254]s; now inside so the committee lookup is reached.
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: EpochNumber(1),
      slot: SlotNumber(100),
      ts: 7150n,
      nowMs: 7150_000n,
    });
    epochCache.isInCommittee.mockResolvedValue(true);
    epochCache.getProposerAttesterAddressInSlot.mockRejectedValue(new NoCommitteeError());

    const result = await validator.validate(mockAttestation);
    expect(result).toEqual({ result: 'reject', severity: PeerErrorSeverity.LowToleranceError });
  });

  describe('clock-disparity widening of the attestation receive window', () => {
    // Attestation window for slot 100 is [buildFrameStart, attestationDeadline] = [7122, 7254]s
    // (buildFrameStart = 100*72 - S - lead = 7122; deadline = 100*72 + S - E - lead = 7254; lead=6),
    // widened by TEST_CLOCK_DISPARITY_MS (0.5s) on both ends. Derived from the timetable so the bounds
    // track the l1PublishLeadTime anchor. These pin the exact widened boundaries.
    const buildFrameStart = makeTimetable().getAttestationReceiveStart(SlotNumber(100));
    const attestationDeadline = makeTimetable().getAttestationDeadline(SlotNumber(100));
    const deltaSeconds = TEST_CLOCK_DISPARITY_MS / 1000;

    function validateAt(nowSeconds: number) {
      const header = CheckpointHeader.random({ slotNumber: SlotNumber(100) });
      const mockAttestation = makeCheckpointAttestation({ header, attesterSigner: attester, proposerSigner: proposer });
      epochCache.getTargetAndNextSlot.mockReturnValue({ targetSlot: SlotNumber(100), nextSlot: SlotNumber(101) });
      epochCache.isInCommittee.mockResolvedValue(true);
      epochCache.getProposerAttesterAddressInSlot.mockResolvedValue(proposer.address);
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: EpochNumber(1),
        slot: SlotNumber(100),
        ts: BigInt(Math.floor(nowSeconds)),
        nowMs: BigInt(Math.round(nowSeconds * 1000)),
      });
      return validator.validate(mockAttestation);
    }

    it('accepts at the build frame start minus the disparity', async () => {
      expect(await validateAt(buildFrameStart - deltaSeconds)).toEqual({ result: 'accept' });
    });

    it('rejects just before the build frame start minus the disparity', async () => {
      expect(await validateAt(buildFrameStart - deltaSeconds - 0.001)).toEqual({
        result: 'reject',
        severity: PeerErrorSeverity.HighToleranceError,
      });
    });

    it('accepts at the attestation deadline plus the disparity', async () => {
      expect(await validateAt(attestationDeadline + deltaSeconds)).toEqual({ result: 'accept' });
    });

    it('rejects just after the attestation deadline plus the disparity', async () => {
      expect(await validateAt(attestationDeadline + deltaSeconds + 0.001)).toEqual({
        result: 'reject',
        severity: PeerErrorSeverity.HighToleranceError,
      });
    });
  });
});
