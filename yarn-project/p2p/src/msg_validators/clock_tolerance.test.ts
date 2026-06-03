import { SlotNumber } from '@aztec/foundation/branded-types';
import { ConsensusTimetable } from '@aztec/stdlib/timetable';

import {
  MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS,
  getAttestationReceiveWindow,
  getProposalReceiveWindow,
  isWithinClockWindow,
} from './clock_tolerance.js';

describe('clock_tolerance', () => {
  describe('MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS', () => {
    it('is set to 500ms', () => {
      expect(MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS).toBe(500);
    });
  });

  // Config: S=72, E=12, D=6, genesis=0. For target slot N:
  //   build_frame_start          = N*72 - 84
  //   proposal receive deadline  = N*72 - 18   (target_slot_start - E - D)
  //   attestation deadline       = N*72 + 48   (target_slot_start + S - 2E)
  const S = 72;
  const E = 12;
  const D = 6;
  const SLOT = SlotNumber(100);
  const buildFrameStart = 100 * S - S - E; // 7116
  const proposalDeadline = 100 * S - E - D; // 7182
  const attestationDeadline = 100 * S + S - 2 * E; // 7248
  const delta = MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS / 1000;

  const timetable = new ConsensusTimetable({
    l1Constants: { l1GenesisTime: 0n, slotDuration: S, ethereumSlotDuration: E },
    blockDuration: D,
  });

  describe('getProposalReceiveWindow', () => {
    it('returns the tight checkpoint proposal receive bounds', () => {
      expect(getProposalReceiveWindow(timetable, SLOT)).toEqual({
        startSeconds: buildFrameStart,
        deadlineSeconds: proposalDeadline,
      });
    });

    it('accepts a proposal arriving inside the window', () => {
      const { startSeconds, deadlineSeconds } = getProposalReceiveWindow(timetable, SLOT);
      expect(isWithinClockWindow((buildFrameStart + 1) * 1000, startSeconds, deadlineSeconds)).toBe(true);
    });

    it('accepts a proposal at the build frame start minus clock disparity', () => {
      const { startSeconds, deadlineSeconds } = getProposalReceiveWindow(timetable, SLOT);
      expect(isWithinClockWindow((buildFrameStart - delta) * 1000, startSeconds, deadlineSeconds)).toBe(true);
    });

    it('rejects a proposal arriving before the window opens', () => {
      const { startSeconds, deadlineSeconds } = getProposalReceiveWindow(timetable, SLOT);
      expect(isWithinClockWindow((buildFrameStart - 1) * 1000, startSeconds, deadlineSeconds)).toBe(false);
    });

    it('accepts a proposal at the receive deadline plus clock disparity', () => {
      const { startSeconds, deadlineSeconds } = getProposalReceiveWindow(timetable, SLOT);
      expect(isWithinClockWindow((proposalDeadline + delta) * 1000, startSeconds, deadlineSeconds)).toBe(true);
    });

    it('rejects a proposal arriving after the receive deadline plus clock disparity', () => {
      const { startSeconds, deadlineSeconds } = getProposalReceiveWindow(timetable, SLOT);
      expect(isWithinClockWindow((proposalDeadline + 1) * 1000, startSeconds, deadlineSeconds)).toBe(false);
    });
  });

  describe('getAttestationReceiveWindow', () => {
    it('returns the liberal attestation receive bounds', () => {
      expect(getAttestationReceiveWindow(timetable, SLOT)).toEqual({
        startSeconds: buildFrameStart,
        deadlineSeconds: attestationDeadline,
      });
    });

    it('accepts an attestation arriving early (at the build frame start)', () => {
      const { startSeconds, deadlineSeconds } = getAttestationReceiveWindow(timetable, SLOT);
      expect(isWithinClockWindow(buildFrameStart * 1000, startSeconds, deadlineSeconds)).toBe(true);
    });

    it('accepts an attestation arriving well into the target slot (liberal window)', () => {
      const { startSeconds, deadlineSeconds } = getAttestationReceiveWindow(timetable, SLOT);
      expect(isWithinClockWindow((100 * S + 30) * 1000, startSeconds, deadlineSeconds)).toBe(true);
    });

    it('accepts an attestation at the attestation deadline plus clock disparity', () => {
      const { startSeconds, deadlineSeconds } = getAttestationReceiveWindow(timetable, SLOT);
      expect(isWithinClockWindow((attestationDeadline + delta) * 1000, startSeconds, deadlineSeconds)).toBe(true);
    });

    it('rejects an attestation arriving after the attestation deadline plus clock disparity', () => {
      const { startSeconds, deadlineSeconds } = getAttestationReceiveWindow(timetable, SLOT);
      expect(isWithinClockWindow((attestationDeadline + 1) * 1000, startSeconds, deadlineSeconds)).toBe(false);
    });

    it('rejects an attestation arriving before the receive window opens', () => {
      const { startSeconds, deadlineSeconds } = getAttestationReceiveWindow(timetable, SLOT);
      expect(isWithinClockWindow((buildFrameStart - 1) * 1000, startSeconds, deadlineSeconds)).toBe(false);
    });
  });
});
