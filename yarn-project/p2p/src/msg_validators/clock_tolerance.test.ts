import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';

import { mock } from 'jest-mock-extended';

import { MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS, PipeliningWindow, isWithinClockTolerance } from './clock_tolerance.js';

describe('clock_tolerance', () => {
  describe('MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS', () => {
    it('is set to 500ms', () => {
      expect(MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS).toBe(500);
    });
  });

  describe('isWithinClockTolerance', () => {
    let epochCache: ReturnType<typeof mock<EpochCacheInterface>>;

    beforeEach(() => {
      epochCache = mock<EpochCacheInterface>();
      // Default getTargetSlot to return SlotNumber(100) - tests override as needed
      epochCache.getTargetSlot.mockReturnValue(SlotNumber(100));
    });

    it('returns true for previous slot message within tolerance window (100ms elapsed)', () => {
      const currentSlot = SlotNumber(100);
      const messageSlot = SlotNumber(99); // previous slot

      // Slot started at 1000 seconds (1000000ms), now is 1000100ms (100ms elapsed)
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n, // seconds
        nowMs: 1000100n, // 100ms after slot start
      });

      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(true);
    });

    it('returns true at exactly 499ms elapsed (just under tolerance)', () => {
      const currentSlot = SlotNumber(100);
      const messageSlot = SlotNumber(99);

      // 499ms elapsed - should be within tolerance (499 < 500)
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000499n,
      });

      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(true);
    });

    it('returns false at exactly 500ms elapsed (at boundary)', () => {
      const currentSlot = SlotNumber(100);
      const messageSlot = SlotNumber(99);

      // 500ms elapsed - should be outside tolerance (500 is NOT < 500)
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000500n,
      });

      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(false);
    });

    it('returns false at 501ms elapsed (just over tolerance)', () => {
      const currentSlot = SlotNumber(100);
      const messageSlot = SlotNumber(99);

      // 501ms elapsed - clearly outside tolerance
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000501n,
      });

      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(false);
    });

    it('returns false for previous slot message well outside tolerance (1000ms elapsed)', () => {
      const currentSlot = SlotNumber(100);
      const messageSlot = SlotNumber(99);

      // 1000ms elapsed - outside 500ms tolerance
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1001000n,
      });

      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(false);
    });

    it('returns false for message two slots behind (currentSlot - 2)', () => {
      const currentSlot = SlotNumber(100);
      const messageSlot = SlotNumber(98); // two slots behind

      // Even within time tolerance, should reject slots older than previous
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000000n, // 0ms elapsed
      });

      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(false);
    });

    it('returns false for current slot message (handled by main validation)', () => {
      const currentSlot = SlotNumber(100);
      const messageSlot = SlotNumber(100); // current slot

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000000n,
      });

      // Current slot messages are handled by the main validation, not clock tolerance
      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(false);
    });

    it('returns false for next slot message (handled by main validation)', () => {
      const currentSlot = SlotNumber(100);
      const messageSlot = SlotNumber(101); // next slot

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000000n,
      });

      // Next slot messages are handled by the main validation, not clock tolerance
      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(false);
    });

    it('returns false when current slot is 0 (genesis edge case)', () => {
      const currentSlot = SlotNumber(0);
      const messageSlot = SlotNumber(0);

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 0 as any,
        slot: currentSlot,
        ts: 0n,
        nowMs: 0n,
      });

      // Cannot have a previous slot when at genesis
      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(false);
    });

    it('returns false for future slot message', () => {
      const currentSlot = SlotNumber(100);
      const messageSlot = SlotNumber(105); // future slot

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000000n,
      });

      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(false);
    });

    it('returns true at 0ms elapsed (exactly at slot boundary)', () => {
      const currentSlot = SlotNumber(100);
      const messageSlot = SlotNumber(99);

      // 0ms elapsed - definitely within tolerance
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000000n, // exactly at slot start
      });

      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(true);
    });

    it('returns false when getTargetSlot() does not match currentSlot argument (sanity check)', () => {
      const currentSlot = SlotNumber(100);
      const messageSlot = SlotNumber(99); // previous slot

      // Simulate a race: caller read target slot as 100, but epoch cache now returns 101
      // (e.g., pipelining was enabled between the two reads)
      epochCache.getTargetSlot.mockReturnValue(SlotNumber(101));

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: currentSlot,
        ts: 1000n,
        nowMs: 1000000n, // 0ms elapsed, within tolerance
      });

      // Even though timing is within tolerance, the sanity check fails
      expect(isWithinClockTolerance(messageSlot, currentSlot, epochCache)).toBe(false);
    });
  });

  describe('PipeliningWindow.acceptsProposal', () => {
    let epochCache: ReturnType<typeof mock<EpochCacheInterface>>;
    let pipeliningWindow: PipeliningWindow;

    beforeEach(() => {
      epochCache = mock<EpochCacheInterface>();
      epochCache.getSlotNow.mockReturnValue(SlotNumber(100));
      epochCache.isProposerPipeliningEnabled.mockReturnValue(true);
      epochCache.getL1Constants.mockReturnValue({
        slotDuration: 72,
        ethereumSlotDuration: 12,
      } as any);
      pipeliningWindow = new PipeliningWindow(epochCache);
    });

    it('returns true when pipelining enabled, message is for current slot, and within grace period', () => {
      // Grace period = DEFAULT_P2P_PROPAGATION_TIME * 1000 = 2000ms
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1001000n, // 1000ms elapsed, within 2000ms grace period
      });

      expect(pipeliningWindow.acceptsProposal(SlotNumber(100))).toBe(true);
    });

    it('returns true at exactly 0ms elapsed', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1000000n, // 0ms elapsed
      });

      expect(pipeliningWindow.acceptsProposal(SlotNumber(100))).toBe(true);
    });

    it('returns false when elapsed time exceeds grace period', () => {
      // 3000ms elapsed > 2000ms grace period
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1003000n, // 3000ms elapsed
      });

      expect(pipeliningWindow.acceptsProposal(SlotNumber(100))).toBe(false);
    });

    it('returns true at the propagation boundary when within clock disparity allowance', () => {
      // 2000ms elapsed = DEFAULT_P2P_PROPAGATION_TIME * 1000, still within the extra 500ms allowance
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1002000n, // 2000ms elapsed
      });

      expect(pipeliningWindow.acceptsProposal(SlotNumber(100))).toBe(true);
    });

    it('returns false at exactly the propagation boundary plus clock disparity allowance', () => {
      // 2500ms elapsed = 2000ms propagation window + 500ms disparity allowance (not strictly less than)
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1002500n, // 2500ms elapsed
      });

      expect(pipeliningWindow.acceptsProposal(SlotNumber(100))).toBe(false);
    });

    it('returns false when pipelining is disabled', () => {
      epochCache.isProposerPipeliningEnabled.mockReturnValue(false);

      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1001000n, // 1000ms elapsed, within grace period
      });

      expect(pipeliningWindow.acceptsProposal(SlotNumber(100))).toBe(false);
    });

    it('returns false when message is not for current slot', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1001000n,
      });

      // Message for slot 99, current slot is 100
      expect(pipeliningWindow.acceptsProposal(SlotNumber(99))).toBe(false);
    });

    it('returns false when message is for a future slot', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1001000n,
      });

      // Message for slot 101, current slot is 100
      expect(pipeliningWindow.acceptsProposal(SlotNumber(101))).toBe(false);
    });

    it('uses the provided propagation time instead of the default', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1003000n, // 3000ms elapsed
      });

      const longerWindow = new PipeliningWindow(epochCache, { p2pPropagationTime: 4 });

      expect(longerWindow.acceptsProposal(SlotNumber(100))).toBe(true);
      expect(pipeliningWindow.acceptsProposal(SlotNumber(100))).toBe(false);
    });
  });

  describe('PipeliningWindow.acceptsAttestation', () => {
    let epochCache: ReturnType<typeof mock<EpochCacheInterface>>;
    let pipeliningWindow: PipeliningWindow;

    beforeEach(() => {
      epochCache = mock<EpochCacheInterface>();
      epochCache.getSlotNow.mockReturnValue(SlotNumber(100));
      epochCache.isProposerPipeliningEnabled.mockReturnValue(true);
      epochCache.getL1Constants.mockReturnValue({
        slotDuration: 72,
        ethereumSlotDuration: 12,
      } as any);
      pipeliningWindow = new PipeliningWindow(epochCache, { l1PublishingTime: 12 });
    });

    it('returns true while still before the target-slot publish cutoff', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1059000n, // 59000ms elapsed
      });

      expect(pipeliningWindow.acceptsAttestation(SlotNumber(100))).toBe(true);
    });

    it('returns true at the target-slot publish cutoff when within clock disparity allowance', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1060000n, // 60000ms elapsed
      });

      expect(pipeliningWindow.acceptsAttestation(SlotNumber(100))).toBe(true);
    });

    it('returns false at the target-slot publish cutoff plus clock disparity allowance', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1060500n, // 60500ms elapsed
      });

      expect(pipeliningWindow.acceptsAttestation(SlotNumber(100))).toBe(false);
    });
  });
});
