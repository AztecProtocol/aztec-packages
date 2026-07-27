import { SlotNumber } from '@aztec/foundation/branded-types';

import { describe, expect, it } from '@jest/globals';

import type { L1RollupConstants } from '../epoch-helpers/index.js';
import { getInboxCutoffTimestamp, isInboxConsumptionSufficient } from './inbox_consumption.js';

// Cross-layer test vectors shared with the `ProposeInboxConsumptionTest` Foundry harness.
// The same vectors are asserted against `ProposeLib.validateInboxConsumption` on L1; keeping them identical here makes
// L1, TS, and the design doc agree on the cutoff formula and the mandatory-consumption boundary.
const GENESIS_TIME = 100_000n;
const SLOT_DURATION = 36;
const LAG_SECONDS = 12;

const l1Constants = { l1GenesisTime: GENESIS_TIME, slotDuration: SLOT_DURATION } as Pick<
  L1RollupConstants,
  'l1GenesisTime' | 'slotDuration'
>;

describe('inbox_consumption', () => {
  describe('getInboxCutoffTimestamp', () => {
    // buildFrameStart(S) = 100000 + (S - 1) * 36; cutoff(S) = buildFrameStart(S) - 12.
    it.each([
      [1, 99_988n],
      [2, 100_024n],
      [10, 100_312n],
      [11, 100_348n],
    ])('matches the A-1371 §13 cutoff table for slot %i', (slot, expectedCutoff) => {
      expect(getInboxCutoffTimestamp(SlotNumber(slot), l1Constants, LAG_SECONDS)).toBe(expectedCutoff);
    });
  });

  describe('isInboxConsumptionSufficient', () => {
    const base = { cutoffTimestamp: 100_312n, checkpointStartTotalMsgCount: 0n, perCheckpointCap: 1024 };

    it('is sufficient when there is no next bucket (consumed everything)', () => {
      expect(isInboxConsumptionSufficient({ ...base, nextBucket: undefined })).toBe(true);
    });

    // Boundary at S=10 (cutoff = 100312): a bucket opened exactly at the cutoff is mandatory (strict `>`).
    it('is insufficient when the next bucket opened exactly at the cutoff is left unconsumed', () => {
      expect(isInboxConsumptionSufficient({ ...base, nextBucket: { timestamp: 100_312n, totalMsgCount: 5n } })).toBe(
        false,
      );
    });

    // Boundary at S=10: a bucket opened at cutoff + 1 is past the cutoff and need not be consumed.
    it('is sufficient when the next bucket opened at cutoff + 1 is left unconsumed', () => {
      expect(isInboxConsumptionSufficient({ ...base, nextBucket: { timestamp: 100_313n, totalMsgCount: 5n } })).toBe(
        true,
      );
    });

    it('is sufficient via cap-escape when consuming through the next bucket would exceed the per-checkpoint cap', () => {
      // Next bucket is at/before the cutoff (would otherwise be mandatory), but consuming through it consumes
      // 1025 > 1024 messages, so leaving it unconsumed is allowed (the cap-escape branch).
      expect(
        isInboxConsumptionSufficient({
          ...base,
          nextBucket: { timestamp: 100_000n, totalMsgCount: 1025n },
        }),
      ).toBe(true);
    });

    it('is insufficient when consuming through the next bucket exactly reaches the per-checkpoint cap', () => {
      // Delta of exactly 1024 does not escape (strict `>` on the cap), so a mandatory bucket must still be consumed.
      expect(
        isInboxConsumptionSufficient({
          ...base,
          nextBucket: { timestamp: 100_000n, totalMsgCount: 1024n },
        }),
      ).toBe(false);
    });

    it('measures the cap-escape delta from the checkpoint start, not from zero', () => {
      // With a non-zero checkpoint start, only the delta consumed this checkpoint counts against the cap.
      expect(
        isInboxConsumptionSufficient({
          cutoffTimestamp: 100_312n,
          checkpointStartTotalMsgCount: 500n,
          perCheckpointCap: 1024,
          nextBucket: { timestamp: 100_000n, totalMsgCount: 1524n },
        }),
      ).toBe(false); // delta = 1024, not an escape
      expect(
        isInboxConsumptionSufficient({
          cutoffTimestamp: 100_312n,
          checkpointStartTotalMsgCount: 500n,
          perCheckpointCap: 1024,
          nextBucket: { timestamp: 100_000n, totalMsgCount: 1525n },
        }),
      ).toBe(true); // delta = 1025, escapes
    });
  });
});
