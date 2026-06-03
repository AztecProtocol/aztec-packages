import { SlotNumber } from '@aztec/foundation/branded-types';

import type { L1RollupConstants } from '../epoch-helpers/index.js';
import { ConsensusTimetable } from './consensus_timetable.js';

/** Builds slot-timing L1 constants with genesis at 0 so absolute times equal offsets from genesis. */
function l1Constants(
  slotDuration: number,
  ethereumSlotDuration: number,
): Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'> {
  return { l1GenesisTime: 0n, slotDuration, ethereumSlotDuration };
}

describe('ConsensusTimetable', () => {
  // Production profile: S=72, E=12, D=6. Use a non-trivial target slot to exercise the slot keying.
  const S = 72;
  const E = 12;
  const D = 6;
  const slot = SlotNumber(5);
  const targetSlotStart = S * slot; // genesis = 0
  const buildFrameStart = targetSlotStart - S - E;

  const timetable = new ConsensusTimetable({ l1Constants: l1Constants(S, E), blockDuration: D });

  it('anchors build frame start at target_slot_start - S - E', () => {
    expect(timetable.getBuildFrameStart(slot)).toBe(buildFrameStart);
    expect(timetable.getTargetSlotStart(slot)).toBe(targetSlotStart);
  });

  it('checkpoint proposal receive start equals the build frame start', () => {
    expect(timetable.getCheckpointProposalReceiveStart(slot)).toBe(buildFrameStart);
  });

  it('checkpoint proposal receive deadline is target_slot_start - E - D (18s before target slot)', () => {
    expect(timetable.getCheckpointProposalReceiveDeadline(slot)).toBe(targetSlotStart - E - D);
    expect(timetable.getCheckpointProposalReceiveDeadline(slot)).toBe(targetSlotStart - 18);
  });

  it('expected checkpoint land time is the receive deadline plus orphan-prune grace', () => {
    const graceSeconds = 2 * D;
    expect(timetable.getExpectedCheckpointLandTime(slot, graceSeconds)).toBe(targetSlotStart - E - D + graceSeconds);
    expect(timetable.getExpectedCheckpointLandTime(slot, graceSeconds)).toBe(targetSlotStart - 6);
  });

  it('rounds expected checkpoint land time up for fractional block durations', () => {
    const fractional = new ConsensusTimetable({ l1Constants: l1Constants(S, E), blockDuration: 5.5 });
    expect(fractional.getExpectedCheckpointLandTime(slot, 12)).toBe(targetSlotStart - 5);
  });

  it('attestation receive start equals the build frame start (liberal lower bound)', () => {
    expect(timetable.getAttestationReceiveStart(slot)).toBe(buildFrameStart);
  });

  it('attestation deadline is target_slot_start + S - 2E (48s after target slot)', () => {
    expect(timetable.getAttestationDeadline(slot)).toBe(targetSlotStart + S - 2 * E);
    expect(timetable.getAttestationDeadline(slot)).toBe(targetSlotStart + 48);
  });

  it('does not require a block duration for the attestation deadline', () => {
    const single = new ConsensusTimetable({ l1Constants: l1Constants(S, E), blockDuration: undefined });
    expect(single.getAttestationDeadline(slot)).toBe(targetSlotStart + 48);
  });

  it('drops the D term from the checkpoint proposal receive deadline in single-block mode', () => {
    const single = new ConsensusTimetable({ l1Constants: l1Constants(S, E), blockDuration: undefined });
    expect(() => single.getCheckpointProposalReceiveDeadline(slot)).not.toThrow();
    expect(single.getCheckpointProposalReceiveDeadline(slot)).toBe(targetSlotStart - E);
  });

  it('handles slot 0 without throwing (p2p validators evaluate windows for peer-supplied slots)', () => {
    const zero = SlotNumber.ZERO;
    expect(() => timetable.getBuildFrameStart(zero)).not.toThrow();
    expect(timetable.getBuildFrameStart(zero)).toBe(-S - E);
    expect(timetable.getCheckpointProposalReceiveDeadline(zero)).toBe(-E - D);
    expect(timetable.getAttestationDeadline(zero)).toBe(S - 2 * E);
  });
});
