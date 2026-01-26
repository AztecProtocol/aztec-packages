import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';

import { mock } from 'jest-mock-extended';

import { MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS, isWithinClockTolerance } from './clock_tolerance.js';

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
  });
});
