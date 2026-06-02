import { SlotNumber } from '@aztec/foundation/branded-types';

import type { L1RollupConstants } from '../epoch-helpers/index.js';
import { ConsensusTimetable, ProposerTimetable, calculateMaxBlocksPerSlot } from './index.js';

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

  it('attestation receive start equals the build frame start (liberal lower bound)', () => {
    expect(timetable.getAttestationReceiveStart(slot)).toBe(buildFrameStart);
  });

  it('attestation deadline is target_slot_start + S - 2E (48s after target slot)', () => {
    expect(timetable.getAttestationDeadline(slot)).toBe(targetSlotStart + S - 2 * E);
    expect(timetable.getAttestationDeadline(slot)).toBe(targetSlotStart + 48);
  });

  it('does not require a block duration for the attestation deadline', () => {
    const single = new ConsensusTimetable({ l1Constants: l1Constants(S, E) });
    expect(single.getAttestationDeadline(slot)).toBe(targetSlotStart + 48);
  });

  it('drops the D term from the checkpoint proposal receive deadline in single-block mode', () => {
    const single = new ConsensusTimetable({ l1Constants: l1Constants(S, E) });
    expect(() => single.getCheckpointProposalReceiveDeadline(slot)).not.toThrow();
    expect(single.getCheckpointProposalReceiveDeadline(slot)).toBe(targetSlotStart - E);
  });
});

describe('ProposerTimetable', () => {
  describe('production profile (S=72, E=12, D=6, minD=2, P=2, prepCp=1)', () => {
    const S = 72;
    const E = 12;
    const slot = SlotNumber(5);
    const targetSlotStart = S * slot;

    const timetable = new ProposerTimetable({
      l1Constants: l1Constants(S, E),
      blockDuration: 6,
      minBlockDuration: 2,
      p2pPropagationTime: 2,
      checkpointProposalPrepareTime: 1,
      enforce: true,
    });

    it('derives max_blocks = 10', () => {
      expect(timetable.getMaxBlocksPerCheckpoint()).toBe(10);
    });

    it('places last_block_build_time 23s before target_slot_start', () => {
      expect(timetable.getLastBlockBuildTime(slot)).toBe(targetSlotStart - 23);
    });

    it('places start_deadline 25s before target_slot_start (last_block_build_time - minD)', () => {
      expect(timetable.getStartDeadline(slot)).toBe(targetSlotStart - 25);
    });

    it('places attestation_deadline 48s after target_slot_start', () => {
      expect(timetable.getAttestationDeadline(slot)).toBe(targetSlotStart + 48);
    });

    it('places l1_publish_ideal_time 12s before target_slot_start', () => {
      expect(timetable.getL1PublishIdealTime(slot)).toBe(targetSlotStart - E);
    });

    it('spaces block build deadlines uniformly from build_frame_start + init', () => {
      // init defaults to 1, so the first sub-slot deadline sits at build_frame_start + 1 + D.
      const buildFrameStart = targetSlotStart - S - E;
      expect(timetable.checkpointProposalInitTime).toBe(1);
      expect(timetable.getBlockBuildDeadline(slot, 0)).toBe(buildFrameStart + 1 + 6);
      expect(timetable.getBlockBuildDeadline(slot, 9)).toBe(buildFrameStart + 1 + 60);
    });

    it('sets wait_for_txs_deadline to block_build_deadline(k) - minD', () => {
      expect(timetable.getWaitForTxsDeadline(slot, 0)).toBe(timetable.getBlockBuildDeadline(slot, 0) - 2);
    });
  });

  describe('local fast profile (S=36, E=4, D=6, minD=1, P=0.5, prepCp=0.5)', () => {
    const timetable = new ProposerTimetable({
      l1Constants: l1Constants(36, 4),
      blockDuration: 6,
      minBlockDuration: 1,
      p2pPropagationTime: 0.5,
      checkpointProposalPrepareTime: 0.5,
      enforce: true,
    });
    const slot = SlotNumber(3);
    const targetSlotStart = 36 * slot;

    it('derives max_blocks = 4', () => {
      expect(timetable.getMaxBlocksPerCheckpoint()).toBe(4);
    });

    it('places last_block_build_time 11.5s before target_slot_start', () => {
      expect(timetable.getLastBlockBuildTime(slot)).toBe(targetSlotStart - 11.5);
    });

    it('places attestation_deadline 28s after target_slot_start', () => {
      expect(timetable.getAttestationDeadline(slot)).toBe(targetSlotStart + 28);
    });
  });

  describe('local slow-block profile (S=36, E=4, D=8, minD=1, P=0.5, prepCp=0.5)', () => {
    const timetable = new ProposerTimetable({
      l1Constants: l1Constants(36, 4),
      blockDuration: 8,
      minBlockDuration: 1,
      p2pPropagationTime: 0.5,
      checkpointProposalPrepareTime: 0.5,
      enforce: true,
    });

    it('derives max_blocks = 3', () => {
      expect(timetable.getMaxBlocksPerCheckpoint()).toBe(3);
    });
  });

  describe('selectNextSubslot', () => {
    const S = 72;
    const E = 12;
    const slot = SlotNumber(5);
    const buildFrameStart = S * slot - S - E;
    // The sub-slot grid starts one init (default 1s) after the build frame opens.
    const firstSubslotStart = buildFrameStart + 1;

    const timetable = new ProposerTimetable({
      l1Constants: l1Constants(S, E),
      blockDuration: 6,
      minBlockDuration: 2,
      p2pPropagationTime: 2,
      checkpointProposalPrepareTime: 1,
      enforce: true,
    });

    it('selects the first sub-slot at the build frame start', () => {
      const result = timetable.selectNextSubslot(slot, buildFrameStart);
      expect(result).toEqual({ canStart: true, index: 0, deadline: firstSubslotStart + 6, isLastBlock: false });
    });

    it('skips sub-slots with less than minD remaining', () => {
      // 5s past the first sub-slot start leaves only 1s < minD (2s) until its deadline; skip to sub-slot 1.
      const result = timetable.selectNextSubslot(slot, firstSubslotStart + 5);
      expect(result.canStart).toBe(true);
      expect(result.index).toBe(1);
      expect(result.deadline).toBe(firstSubslotStart + 12);
    });

    it('flags the last sub-slot', () => {
      const lastDeadline = timetable.getBlockBuildDeadline(slot, 9);
      const result = timetable.selectNextSubslot(slot, lastDeadline - 2);
      expect(result.canStart).toBe(true);
      expect(result.index).toBe(9);
      expect(result.isLastBlock).toBe(true);
    });

    it('refuses to start once no sub-slot has minD remaining', () => {
      const lastDeadline = timetable.getBlockBuildDeadline(slot, 9);
      const result = timetable.selectNextSubslot(slot, lastDeadline);
      expect(result.canStart).toBe(false);
      expect(result.deadline).toBeUndefined();
    });

    // Regression: with a tight fast profile where minD == D, the first sub-slot used to be anchored at
    // build_frame_start, so any non-zero proposer prologue starved it (deadline - now < minD) and the
    // checkpoint under-packed to a single block. The init offset gives the first sub-slot its full
    // duration once the prologue completes, so a realistic late start still packs both sub-slots.
    describe('packs minimum blocks with a realistic late proposer start (minD == D)', () => {
      const tightS = 12;
      const tightE = 4;
      const tightD = 2;
      const tightSlot = SlotNumber(11);
      const tightBuildFrameStart = tightS * tightSlot - tightS - tightE;

      const tight = new ProposerTimetable({
        l1Constants: l1Constants(tightS, tightE),
        blockDuration: tightD,
        minBlockDuration: 2,
        p2pPropagationTime: 2,
        checkpointProposalPrepareTime: 1,
        enforce: true,
      });

      it('derives two sub-slots', () => {
        expect(tight.getMaxBlocksPerCheckpoint()).toBe(2);
      });

      it('selects sub-slot 0 (not 1) when starting just after the build frame opens', () => {
        // Proposer enters the build loop ~0.75s into the build frame after sync + proposer check + init.
        const now = tightBuildFrameStart + 0.75;
        const result = tight.selectNextSubslot(tightSlot, now);
        expect(result.canStart).toBe(true);
        expect(result.index).toBe(0);
        expect(result.isLastBlock).toBe(false);
      });

      it('selects the final sub-slot for the second block after the first finishes', () => {
        // After building block 0 the proposer waits until sub-slot 0's deadline, then selects sub-slot 1.
        const subslot0Deadline = tight.getBlockBuildDeadline(tightSlot, 0);
        const result = tight.selectNextSubslot(tightSlot, subslot0Deadline);
        expect(result.canStart).toBe(true);
        expect(result.index).toBe(1);
        expect(result.isLastBlock).toBe(true);
      });
    });
  });

  describe('non-enforced mode', () => {
    const timetable = new ProposerTimetable({
      l1Constants: l1Constants(72, 12),
      blockDuration: 6,
      enforce: false,
    });

    it('always allows starting a single last block with no deadline', () => {
      const result = timetable.selectNextSubslot(SlotNumber(5), Number.MAX_SAFE_INTEGER);
      expect(result.canStart).toBe(true);
      expect(result.isLastBlock).toBe(true);
      expect(result.deadline).toBeUndefined();
    });
  });

  describe('single-block enforced mode (no blockDuration)', () => {
    const S = 72;
    const E = 12;
    const slot = SlotNumber(5);
    const targetSlotStart = S * slot;

    const timetable = new ProposerTimetable({
      l1Constants: l1Constants(S, E),
      minBlockDuration: 2,
      enforce: true,
    });

    it('reports a single block per checkpoint', () => {
      expect(timetable.getMaxBlocksPerCheckpoint()).toBe(1);
    });

    it('splits the remaining time until the attestation deadline between execution and re-execution', () => {
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
      const now = attestationDeadline - 2 * 2 + 0.1; // less than 2*minD remaining
      const result = timetable.selectNextSubslot(slot, now);
      expect(result.canStart).toBe(false);
    });

    it('keeps the start deadline at attestation_deadline - 2*minD (matching selectNextSubslot)', () => {
      const attestationDeadline = targetSlotStart + 48;
      expect(timetable.getStartDeadline(slot)).toBe(attestationDeadline - 2 * 2);
    });

    it('never abandons a slot that selectNextSubslot would still allow to start', () => {
      // The latest now at which the single-block branch still allows a start: now <= attestationDeadline
      // - 2*minD. The build-entry gate must not give up before then, so getStartDeadline must be >= it.
      const startDeadline = timetable.getStartDeadline(slot);
      expect(timetable.selectNextSubslot(slot, startDeadline).canStart).toBe(true);
      // Just past the start deadline both must agree the slot is gone.
      expect(timetable.selectNextSubslot(slot, startDeadline + 0.001).canStart).toBe(false);
    });
  });
});

describe('calculateMaxBlocksPerSlot', () => {
  it('matches the production worked example (10 blocks)', () => {
    expect(
      calculateMaxBlocksPerSlot(72, 6, {
        ethereumSlotDuration: 12,
        p2pPropagationTime: 2,
        checkpointProposalPrepareTime: 1,
      }),
    ).toBe(10);
  });

  it('matches the local fast profile (4 blocks)', () => {
    expect(
      calculateMaxBlocksPerSlot(36, 6, {
        ethereumSlotDuration: 4,
        p2pPropagationTime: 0.5,
        checkpointProposalPrepareTime: 0.5,
      }),
    ).toBe(4);
  });

  it('matches the local slow-block profile (3 blocks)', () => {
    expect(
      calculateMaxBlocksPerSlot(36, 8, {
        ethereumSlotDuration: 4,
        p2pPropagationTime: 0.5,
        checkpointProposalPrepareTime: 0.5,
      }),
    ).toBe(3);
  });

  it('returns 1 for single-block mode', () => {
    expect(calculateMaxBlocksPerSlot(72, undefined)).toBe(1);
  });
});
