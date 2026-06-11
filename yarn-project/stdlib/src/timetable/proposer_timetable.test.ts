import { SlotNumber } from '@aztec/foundation/branded-types';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';

import type { L1RollupConstants } from '../epoch-helpers/index.js';
import { ProposerTimetable } from './proposer_timetable.js';

/** Builds slot-timing L1 constants with genesis at 0 so absolute times equal offsets from genesis. */
function l1Constants(
  slotDuration: number,
  ethereumSlotDuration: number,
): Pick<L1RollupConstants, 'l1GenesisTime' | 'slotDuration' | 'ethereumSlotDuration'> {
  return { l1GenesisTime: 0n, slotDuration, ethereumSlotDuration };
}

/**
 * Constructs a {@link ProposerTimetable} with the production operational budgets filled in, letting each
 * test override only what it cares about. The timetable now requires every budget, so this is the test's
 * config layer: it supplies the production defaults (minD=2, P=2, prepCp=1, init=1) the cases assert against.
 */
function makeProposerTimetable(
  opts: Omit<
    ConstructorParameters<typeof ProposerTimetable>[0],
    'minBlockDuration' | 'p2pPropagationTime' | 'checkpointProposalPrepareTime' | 'checkpointProposalInitTime'
  > & {
    minBlockDuration?: number;
    p2pPropagationTime?: number;
    checkpointProposalPrepareTime?: number;
    checkpointProposalInitTime?: number;
  },
): ProposerTimetable {
  return new ProposerTimetable({
    minBlockDuration: 2,
    p2pPropagationTime: 2,
    checkpointProposalPrepareTime: 1,
    checkpointProposalInitTime: 1,
    ...opts,
  });
}

describe('ProposerTimetable', () => {
  describe('production profile (S=72, E=12, D=6, minD=2, P=2, prepCp=1)', () => {
    const S = 72;
    const E = 12;
    const slot = SlotNumber(5);
    const targetSlotStart = S * slot;

    const timetable = makeProposerTimetable({
      l1Constants: l1Constants(S, E),
      blockDuration: 6,
      minBlockDuration: 2,
      p2pPropagationTime: 2,
      checkpointProposalPrepareTime: 1,
    });

    it('derives max_blocks = 10', () => {
      expect(timetable.getMaxBlocksPerCheckpoint()).toBe(10);
    });

    it('places last_block_build_time 23s before target_slot_start', () => {
      expect(timetable.getLastBlockBuildTime(slot)).toBe(targetSlotStart - 23);
    });

    it('places start_deadline 25s before target_slot_start (last_block_build_time - minD)', () => {
      expect(timetable.getBuildStartDeadline(slot)).toBe(targetSlotStart - 25);
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
    const timetable = makeProposerTimetable({
      l1Constants: l1Constants(36, 4),
      blockDuration: 6,
      minBlockDuration: 1,
      p2pPropagationTime: 0.5,
      checkpointProposalPrepareTime: 0.5,
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
    const timetable = makeProposerTimetable({
      l1Constants: l1Constants(36, 4),
      blockDuration: 8,
      minBlockDuration: 1,
      p2pPropagationTime: 0.5,
      checkpointProposalPrepareTime: 0.5,
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

    const timetable = makeProposerTimetable({
      l1Constants: l1Constants(S, E),
      blockDuration: 6,
      minBlockDuration: 2,
      p2pPropagationTime: 2,
      checkpointProposalPrepareTime: 1,
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

    // Regression: with a tight profile the first sub-slot used to be anchored at build_frame_start, so any
    // non-zero proposer prologue starved it (deadline - now < minD) and the checkpoint under-packed. The init
    // offset gives the first sub-slot its full duration once the prologue completes, so a realistic late start
    // still packs the minimum. This mirrors the l2_to_l1 e2e config (S=12, E=4, D=2): the timetable receives
    // the production budget defaults (P=2, prepCp=1, minD=2) because the test does not override them, but the
    // fast local profile (E < 8) clamps them down to fast values so the build window matches local timing.
    describe('packs minimum blocks with a realistic late proposer start (l2_to_l1 12/4/2 fast profile)', () => {
      const tightS = 12;
      const tightE = 4;
      const tightD = 2;
      const tightSlot = SlotNumber(11);
      const tightBuildFrameStart = tightS * tightSlot - tightS - tightE;

      // Pass production budget defaults to mirror the e2e config that sets only S/E/D; the fast profile
      // (E < 8) clamps p2pPropagationTime to 0.5, checkpointProposalPrepareTime to 0.5, and minBlockDuration
      // to 1, restoring the pre-refactor build-window capacity for fast local networks.
      const tight = makeProposerTimetable({
        l1Constants: l1Constants(tightS, tightE),
        blockDuration: tightD,
        minBlockDuration: 2,
        p2pPropagationTime: 2,
        checkpointProposalPrepareTime: 1,
      });

      it('clamps budgets to the fast profile', () => {
        expect(tight.p2pPropagationTime).toBe(0.5);
        expect(tight.checkpointProposalPrepareTime).toBe(0.5);
        expect(tight.minBlockDuration).toBe(1);
      });

      it('derives three sub-slots (fast profile, not the production-budget two)', () => {
        // floor((12 - init(1) - D(2) - 2*P(0.5) - prepCp(0.5)) / 2) = floor(7.5 / 2) = 3.
        expect(tight.getMaxBlocksPerCheckpoint()).toBe(3);
      });

      it('selects sub-slot 0 (not 1) when starting just after the build frame opens', () => {
        // Proposer enters the build loop ~0.75s into the build frame after sync + proposer check + init.
        const now = tightBuildFrameStart + 0.75;
        const result = tight.selectNextSubslot(tightSlot, now);
        expect(result.canStart).toBe(true);
        expect(result.index).toBe(0);
        expect(result.isLastBlock).toBe(false);
      });

      it('selects the final sub-slot after the earlier blocks finish', () => {
        // After building block 1 (index 1) the proposer waits until its deadline, then selects the final
        // sub-slot (index 2).
        const subslot1Deadline = tight.getBlockBuildDeadline(tightSlot, 1);
        const result = tight.selectNextSubslot(tightSlot, subslot1Deadline);
        expect(result.canStart).toBe(true);
        expect(result.index).toBe(2);
        expect(result.isLastBlock).toBe(true);
      });
    });
  });
});

describe('ProposerTimetable.getMaxBlocksPerCheckpoint', () => {
  it('matches the production worked example (10 blocks)', () => {
    const timetable = makeProposerTimetable({
      l1Constants: l1Constants(72, 12),
      blockDuration: 6,
      p2pPropagationTime: 2,
      checkpointProposalPrepareTime: 1,
    });
    expect(timetable.getMaxBlocksPerCheckpoint()).toBe(10);
  });

  it('matches the local fast profile (4 blocks)', () => {
    const timetable = makeProposerTimetable({
      l1Constants: l1Constants(36, 4),
      blockDuration: 6,
      p2pPropagationTime: 0.5,
      checkpointProposalPrepareTime: 0.5,
    });
    expect(timetable.getMaxBlocksPerCheckpoint()).toBe(4);
  });

  it('matches the local slow-block profile (3 blocks)', () => {
    const timetable = makeProposerTimetable({
      l1Constants: l1Constants(36, 4),
      blockDuration: 8,
      p2pPropagationTime: 0.5,
      checkpointProposalPrepareTime: 0.5,
    });
    expect(timetable.getMaxBlocksPerCheckpoint()).toBe(3);
  });

  it('can derive one block per checkpoint with a concrete block duration', () => {
    const timetable = makeProposerTimetable({
      l1Constants: l1Constants(72, 12),
      blockDuration: 24,
    });
    expect(timetable.getMaxBlocksPerCheckpoint()).toBe(1);
  });

  // The fast local profile (E < 8) clamps the operational budgets so a fast network does not inherit the
  // conservative production budgets, which would shrink the build window and under-pack checkpoints.
  it('applies the fast profile to production-budget inputs on a low ethereum slot duration', () => {
    // S=36, E=4, D=8 with production budgets would derive only 2; the fast profile restores 3.
    const timetable = makeProposerTimetable({
      l1Constants: l1Constants(36, 4),
      blockDuration: 8,
      p2pPropagationTime: 2,
      checkpointProposalPrepareTime: 1,
    });
    expect(timetable.getMaxBlocksPerCheckpoint()).toBe(3);
  });

  it('does not apply the fast profile at or above the ethereum slot threshold', () => {
    // S=36, E=12, D=6 with P=2: production budgets are kept -> floor((36-1-6-4-1)/6) = 4.
    const timetable = makeProposerTimetable({
      l1Constants: l1Constants(36, 12),
      blockDuration: 6,
      p2pPropagationTime: 2,
      checkpointProposalPrepareTime: 1,
    });
    expect(timetable.getMaxBlocksPerCheckpoint()).toBe(4);
  });
});

// Guards the per-checkpoint build capacity for the enforced-timetable multi-block e2e configs. Each config
// only sets a subset of timing budgets; the rest fall back to production defaults, which on fast local
// networks (E < 8) are clamped to the fast profile. These assertions pin the derived capacity to the value
// required by the test's minBlocksForCheckpoint and to the expected build-window count, so a future
// budget/profile change cannot silently under-pack these checkpoints again.
describe('e2e multi-block-per-checkpoint capacity', () => {
  // name, S, E, D, budgets the e2e config sets, required (minBlocksForCheckpoint), expected derived count.
  const cases: Array<{
    name: string;
    S: number;
    E: number;
    D: number;
    budgets: { p2pPropagationTime?: number; checkpointProposalPrepareTime?: number; minBlockDuration?: number };
    required: number;
    expected: number;
  }> = [
    // attested_invalid_proposal: sets attestationPropagationTime=0.5 only.
    {
      name: 'attested_invalid_proposal 36/4/8',
      S: 36,
      E: 4,
      D: 8,
      budgets: { p2pPropagationTime: 0.5 },
      required: 3,
      expected: 3,
    },
    // epochs_l1_reorgs: sets no timing budgets -> inherits production defaults, clamped by the fast profile.
    { name: 'epochs_l1_reorgs 36/4/8', S: 36, E: 4, D: 8, budgets: {}, required: 2, expected: 3 },
    // l2_to_l1: sets no timing budgets -> inherits production defaults, clamped by the fast profile. Derives
    // 3 (the spec fast profile uses P=0.5; pre-refactor used P=0 and derived 4). Both exceed the required 2.
    { name: 'l2_to_l1 12/4/2', S: 12, E: 4, D: 2, budgets: {}, required: 2, expected: 3 },
    // epochs_high_tps_block_building: E=12 (>= threshold), sets attestationPropagationTime=1.
    {
      name: 'epochs_high_tps 36/12/6',
      S: 36,
      E: 12,
      D: 6,
      budgets: { p2pPropagationTime: 1 },
      required: 2,
      expected: 4,
    },
    // Production profile.
    {
      name: 'production 72/12/6',
      S: 72,
      E: 12,
      D: 6,
      budgets: { p2pPropagationTime: 2, checkpointProposalPrepareTime: 1, minBlockDuration: 2 },
      required: 10,
      expected: 10,
    },
  ];

  it.each(cases)(
    '$name derives >= minBlocksForCheckpoint and the expected build-window count',
    ({ S, E, D, budgets, required, expected }) => {
      const timetable = makeProposerTimetable({
        l1Constants: l1Constants(S, E),
        blockDuration: D,
        ...budgets,
      });
      const derived = timetable.getMaxBlocksPerCheckpoint();
      expect(derived).toBeGreaterThanOrEqual(required);
      expect(derived).toBe(expected);
    },
  );
});

describe('ProposerTimetable explicit network maxBlocksPerCheckpoint', () => {
  // Production profile derives 10 locally achievable blocks.
  const productionOpts = {
    l1Constants: l1Constants(72, 12),
    blockDuration: 6,
    minBlockDuration: 2,
    p2pPropagationTime: 2,
    checkpointProposalPrepareTime: 1,
  };

  it('uses the network value when below the locally computed count', () => {
    const timetable = makeProposerTimetable({ ...productionOpts, maxBlocksPerCheckpoint: 4 });
    expect(timetable.getMaxBlocksPerCheckpoint()).toBe(4);
  });

  it('clamps the network value down to the locally computed count when the network value is higher', () => {
    const timetable = makeProposerTimetable({ ...productionOpts, maxBlocksPerCheckpoint: 20 });
    expect(timetable.getMaxBlocksPerCheckpoint()).toBe(10);
  });

  it('keeps every offered sub-slot build deadline within the last block build time when clamped', () => {
    const timetable = makeProposerTimetable({ ...productionOpts, maxBlocksPerCheckpoint: 20 });
    const slot = SlotNumber(5);
    const effective = timetable.getMaxBlocksPerCheckpoint();
    expect(timetable.getBlockBuildDeadline(slot, effective - 1)).toBeLessThanOrEqual(
      timetable.getLastBlockBuildTime(slot),
    );
  });

  it('uses the locally computed count when no network value is given', () => {
    const timetable = makeProposerTimetable(productionOpts);
    expect(timetable.getMaxBlocksPerCheckpoint()).toBe(10);
  });

  it('warns when the locally computed count exceeds the network value (clamps down)', () => {
    const logger = createLogger('test:stdlib:proposer_timetable');
    const warnSpy = jest.spyOn(logger, 'warn');
    const timetable = makeProposerTimetable({ ...productionOpts, maxBlocksPerCheckpoint: 4, logger });
    expect(timetable.getMaxBlocksPerCheckpoint()).toBe(4);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('does not warn when the network value is at or above the locally computed count', () => {
    const logger = createLogger('test:stdlib:proposer_timetable');
    const warnSpy = jest.spyOn(logger, 'warn');
    const atComputed = makeProposerTimetable({ ...productionOpts, maxBlocksPerCheckpoint: 10, logger });
    expect(atComputed.getMaxBlocksPerCheckpoint()).toBe(10);
    const aboveComputed = makeProposerTimetable({ ...productionOpts, maxBlocksPerCheckpoint: 20, logger });
    expect(aboveComputed.getMaxBlocksPerCheckpoint()).toBe(10);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('throws when local budgets cannot fit a single block even with an explicit network value', () => {
    expect(() =>
      makeProposerTimetable({
        l1Constants: l1Constants(72, 12),
        blockDuration: 72,
        maxBlocksPerCheckpoint: 5,
      }),
    ).toThrow(/blocks per checkpoint/);
  });
});
