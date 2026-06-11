import { SlotNumber } from '@aztec/foundation/branded-types';

import type { L1RollupConstants } from '../epoch-helpers/index.js';
import { getDefaultL1PublishLeadTime } from './budgets.js';
import { ConsensusTimetable } from './consensus_timetable.js';

/** Builds slot-timing L1 constants with genesis at 0 so absolute times equal offsets from genesis. */
function l1Constants(
  slotDuration: number,
  ethereumSlotDuration: number,
  l1PublishLeadTime?: number,
): Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration' | 'l1PublishLeadTime'> {
  return { l1GenesisTime: 0n, slotDuration, ethereumSlotDuration, l1PublishLeadTime };
}

describe('ConsensusTimetable', () => {
  // Production profile: S=72, E=12, D=6, lead=6 (clamp-rule default). Use a non-trivial target slot.
  const S = 72;
  const E = 12;
  const D = 6;
  const lead = 6;
  const slot = SlotNumber(5);
  const targetSlotStart = S * slot; // genesis = 0
  const buildFrameStart = targetSlotStart - S - lead;

  const timetable = new ConsensusTimetable({ l1Constants: l1Constants(S, E), blockDuration: D });

  it('defaults l1PublishLeadTime to the clamp rule when unset', () => {
    expect(timetable.l1PublishLeadTime).toBe(lead);
  });

  it('anchors build frame start at target_slot_start - S - lead', () => {
    expect(timetable.getBuildFrameStart(slot)).toBe(buildFrameStart);
    expect(timetable.getTargetSlotStart(slot)).toBe(targetSlotStart);
  });

  it('checkpoint proposal receive start equals the build frame start', () => {
    expect(timetable.getCheckpointProposalReceiveStart(slot)).toBe(buildFrameStart);
  });

  it('checkpoint proposal receive deadline is target_slot_start - lead - D (12s before target slot)', () => {
    expect(timetable.getCheckpointProposalReceiveDeadline(slot)).toBe(targetSlotStart - lead - D);
    expect(timetable.getCheckpointProposalReceiveDeadline(slot)).toBe(targetSlotStart - 12);
  });

  it('checkpoint proposal synced deadline is next proposer build frame start plus sync grace', () => {
    // next_proposer_build_frame_start = target - lead; sync grace defaults to 2D.
    expect(timetable.getCheckpointProposalSyncedDeadline(slot)).toBe(targetSlotStart - lead + 2 * D);
    expect(timetable.getCheckpointProposalSyncedDeadline(slot)).toBe(targetSlotStart + 6);
  });

  it('rounds checkpoint proposal synced deadline up for fractional block durations', () => {
    const fractional = new ConsensusTimetable({
      l1Constants: l1Constants(S, E),
      blockDuration: 5.5,
      checkpointProposalSyncGrace: 12.25,
    });
    // target - lead - 5.5 (receive deadline) + 5.5 (D) + 12.25 (grace) = target + 6.25 -> ceil = target + 7.
    expect(fractional.getCheckpointProposalSyncedDeadline(slot)).toBe(targetSlotStart + 7);
  });

  it('attestation receive start equals the build frame start (liberal lower bound)', () => {
    expect(timetable.getAttestationReceiveStart(slot)).toBe(buildFrameStart);
  });

  it('attestation deadline is target_slot_start + S - E - lead (54s after target slot)', () => {
    expect(timetable.getAttestationDeadline(slot)).toBe(targetSlotStart + S - E - lead);
    expect(timetable.getAttestationDeadline(slot)).toBe(targetSlotStart + 54);
  });

  it('handles slot 0 without throwing (p2p validators evaluate windows for peer-supplied slots)', () => {
    const zero = SlotNumber.ZERO;
    expect(() => timetable.getBuildFrameStart(zero)).not.toThrow();
    expect(timetable.getBuildFrameStart(zero)).toBe(-S - lead);
    expect(timetable.getCheckpointProposalReceiveDeadline(zero)).toBe(-lead - D);
    expect(timetable.getAttestationDeadline(zero)).toBe(S - E - lead);
  });

  describe('l1PublishLeadTime default (clamp rule)', () => {
    it('derives 2s for the fast profile (E=4)', () => {
      expect(getDefaultL1PublishLeadTime(4)).toBe(2);
      expect(new ConsensusTimetable({ l1Constants: l1Constants(36, 4), blockDuration: 6 }).l1PublishLeadTime).toBe(2);
    });

    it('derives 4s at E=8', () => {
      expect(getDefaultL1PublishLeadTime(8)).toBe(4);
    });

    it('derives 6s in production (E=12) and clamps the upper bound', () => {
      expect(getDefaultL1PublishLeadTime(12)).toBe(6);
      expect(getDefaultL1PublishLeadTime(20)).toBe(6);
    });

    it('clamps the lower bound to 1s for tiny ethereum slot durations', () => {
      expect(getDefaultL1PublishLeadTime(1)).toBe(1);
    });
  });

  describe('l1PublishLeadTime validation (0 < lead < E)', () => {
    it('accepts an explicit lead inside the open interval', () => {
      const explicit = new ConsensusTimetable({ l1Constants: l1Constants(S, E, 3), blockDuration: D });
      expect(explicit.l1PublishLeadTime).toBe(3);
      expect(explicit.getAttestationDeadline(slot)).toBe(targetSlotStart + S - E - 3);
      expect(explicit.getCheckpointProposalReceiveDeadline(slot)).toBe(targetSlotStart - 3 - D);
    });

    it('throws when lead is not positive', () => {
      expect(() => new ConsensusTimetable({ l1Constants: l1Constants(S, E, 0), blockDuration: D })).toThrow(
        /l1PublishLeadTime/,
      );
    });

    it('throws when lead is at or above the ethereum slot duration', () => {
      expect(() => new ConsensusTimetable({ l1Constants: l1Constants(S, E, E), blockDuration: D })).toThrow(
        /l1PublishLeadTime/,
      );
    });
  });
});
