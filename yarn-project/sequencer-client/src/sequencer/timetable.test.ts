import { SlotNumber } from '@aztec/foundation/branded-types';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

import { SequencerTimetable } from './timetable.js';

describe('SequencerTimetable', () => {
  const ETHEREUM_SLOT_DURATION = 12;
  const AZTEC_SLOT_DURATION = 72;

  function l1Constants(
    slotDuration = AZTEC_SLOT_DURATION,
    ethereumSlotDuration = ETHEREUM_SLOT_DURATION,
  ): Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'> {
    return { l1GenesisTime: 0n, slotDuration, ethereumSlotDuration };
  }

  describe('construction', () => {
    it('fails to construct when the config cannot fit a single block', () => {
      // floor((10 - 6 - 2*2 - 1)/6) = floor(-1/6) = -1 < 1 → throws.
      expect(
        () =>
          new SequencerTimetable({
            l1Constants: l1Constants(10),
            blockDurationMs: 6000,
            minBlockDuration: 2,
            p2pPropagationTime: 2,
            checkpointProposalPrepareTime: 1,
            enforce: true,
          }),
      ).toThrow(/Invalid timing configuration/i);
    });

    it('derives the production block count (10)', () => {
      const timetable = new SequencerTimetable({
        l1Constants: l1Constants(72),
        blockDurationMs: 6000,
        minBlockDuration: 2,
        p2pPropagationTime: 2,
        checkpointProposalPrepareTime: 1,
        enforce: true,
      });
      expect(timetable.maxNumberOfBlocks).toBe(10);
      expect(timetable.minBlockDuration).toBe(2);
      expect(timetable.enforce).toBe(true);
    });
  });

  describe('deadlines (production profile, genesis = 0)', () => {
    const slot = SlotNumber(5);
    const targetSlotStart = AZTEC_SLOT_DURATION * slot;
    let timetable: SequencerTimetable;

    beforeEach(() => {
      timetable = new SequencerTimetable({
        l1Constants: l1Constants(),
        blockDurationMs: 6000,
        minBlockDuration: 2,
        p2pPropagationTime: 2,
        checkpointProposalPrepareTime: 1,
        enforce: true,
      });
    });

    it('start deadline is 25s before target_slot_start (last_block_build_time - minD)', () => {
      expect(timetable.getStartDeadline(slot)).toBe(targetSlotStart - 25);
    });

    it('attestation deadline is 48s after target_slot_start', () => {
      expect(timetable.getAttestationDeadline(slot)).toBe(targetSlotStart + 48);
    });

    it('wait-for-txs deadline is block_build_deadline(k) - minD', () => {
      const buildFrameStart = targetSlotStart - AZTEC_SLOT_DURATION - ETHEREUM_SLOT_DURATION;
      // block_build_deadline(0) = build_frame_start + 6; minus minD (2).
      expect(timetable.getWaitForTxsDeadline(slot, 0)).toBe(buildFrameStart + 6 - 2);
    });
  });

  describe('selectNextSubslot', () => {
    const slot = SlotNumber(5);
    const targetSlotStart = AZTEC_SLOT_DURATION * slot;
    const buildFrameStart = targetSlotStart - AZTEC_SLOT_DURATION - ETHEREUM_SLOT_DURATION;

    describe('multi-block enforced', () => {
      let timetable: SequencerTimetable;

      beforeEach(() => {
        timetable = new SequencerTimetable({
          l1Constants: l1Constants(),
          blockDurationMs: 8000,
          minBlockDuration: 2,
          p2pPropagationTime: 2,
          checkpointProposalPrepareTime: 1,
          enforce: true,
        });
      });

      it('selects the first sub-slot at the build frame start', () => {
        const result = timetable.selectNextSubslot(slot, buildFrameStart);
        expect(result.canStart).toBe(true);
        expect(result.index).toBe(0);
        expect(result.deadline).toBe(buildFrameStart + 8);
        expect(result.isLastBlock).toBe(false);
      });

      it('skips a sub-slot with less than minD remaining', () => {
        // 7s past build frame leaves 1s < minD (2s) in sub-slot 0; skip to sub-slot 1.
        const result = timetable.selectNextSubslot(slot, buildFrameStart + 7);
        expect(result.canStart).toBe(true);
        expect(result.index).toBe(1);
        expect(result.deadline).toBe(buildFrameStart + 16);
      });

      it('flags the last sub-slot and refuses to start past it', () => {
        const maxBlocks = timetable.maxNumberOfBlocks;
        const lastDeadline = buildFrameStart + maxBlocks * 8;
        const last = timetable.selectNextSubslot(slot, lastDeadline - 2);
        expect(last.canStart).toBe(true);
        expect(last.index).toBe(maxBlocks - 1);
        expect(last.isLastBlock).toBe(true);

        const tooLate = timetable.selectNextSubslot(slot, lastDeadline);
        expect(tooLate.canStart).toBe(false);
      });
    });

    describe('non-enforced mode', () => {
      it('always allows a single last block with no deadline', () => {
        const timetable = new SequencerTimetable({
          l1Constants: l1Constants(),
          blockDurationMs: 8000,
          enforce: false,
        });
        const result = timetable.selectNextSubslot(slot, Number.MAX_SAFE_INTEGER);
        expect(result.canStart).toBe(true);
        expect(result.isLastBlock).toBe(true);
        expect(result.deadline).toBeUndefined();
      });
    });

    describe('single-block enforced mode', () => {
      let timetable: SequencerTimetable;

      beforeEach(() => {
        timetable = new SequencerTimetable({
          l1Constants: l1Constants(),
          minBlockDuration: 2,
          enforce: true,
        });
      });

      it('reports a single block per checkpoint', () => {
        expect(timetable.maxNumberOfBlocks).toBe(1);
      });

      it('splits remaining time until the attestation deadline', () => {
        const now = targetSlotStart - 20;
        const attestationDeadline = targetSlotStart + 48;
        const available = (attestationDeadline - now) / 2;
        const result = timetable.selectNextSubslot(slot, now);
        expect(result.canStart).toBe(true);
        expect(result.isLastBlock).toBe(true);
        expect(result.deadline).toBe(now + available);
      });

      it('refuses to start when the split time falls below minD', () => {
        const attestationDeadline = targetSlotStart + 48;
        const now = attestationDeadline - 2 * 2 + 0.1;
        const result = timetable.selectNextSubslot(slot, now);
        expect(result.canStart).toBe(false);
      });

      it('keeps getStartDeadline consistent with selectNextSubslot so the build gate does not abandon early', () => {
        const attestationDeadline = targetSlotStart + 48;
        const startDeadline = timetable.getStartDeadline(slot);
        // Start deadline matches selectNextSubslot's single-block cutoff (attestation_deadline - 2*minD).
        expect(startDeadline).toBe(attestationDeadline - 2 * 2);
        // The build-entry gate (now > startDeadline → abandon) must never give up a slot selectNextSubslot
        // would still allow to start.
        expect(timetable.selectNextSubslot(slot, startDeadline).canStart).toBe(true);
        expect(timetable.selectNextSubslot(slot, startDeadline + 0.001).canStart).toBe(false);
      });
    });
  });
});
