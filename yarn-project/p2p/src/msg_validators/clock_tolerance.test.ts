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
    // Config: 72s slot, 2s p2p.
    // Under early pipelining, proposalWindowIntoTargetSlot = 0: only the 500ms
    // clock-disparity grace keeps old-target-slot proposals acceptable after the
    // receiver rolls into the next slot.
    let epochCache: ReturnType<typeof mock<EpochCacheInterface>>;
    let pipeliningWindow: PipeliningWindow;

    beforeEach(() => {
      epochCache = mock<EpochCacheInterface>();
      epochCache.getSlotNow.mockReturnValue(SlotNumber(100));
      epochCache.getL1Constants.mockReturnValue({
        slotDuration: 72,
        ethereumSlotDuration: 12,
      } as any);
      pipeliningWindow = new PipeliningWindow(epochCache);
    });

    it('accepts a current-slot proposal within clock-disparity grace', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1000400n, // 400ms elapsed, within 500ms grace
      });

      expect(pipeliningWindow.acceptsProposal(SlotNumber(100))).toBe(true);
    });

    it('rejects a current-slot proposal past the clock-disparity grace', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1001000n, // 1000ms elapsed, past 500ms grace
      });

      expect(pipeliningWindow.acceptsProposal(SlotNumber(100))).toBe(false);
    });

    it('rejects proposals for other slots regardless of elapsed time', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1000000n,
      });

      expect(pipeliningWindow.acceptsProposal(SlotNumber(99))).toBe(false);
      expect(pipeliningWindow.acceptsProposal(SlotNumber(101))).toBe(false);
      expect(pipeliningWindow.acceptsProposal(SlotNumber(102))).toBe(false);
    });
  });

  describe('PipeliningWindow.acceptsAttestation', () => {
    // Config: 72s slot, 12s Ethereum slot.
    // attestationWindowIntoTargetSlot now spans target-slot start to the L1 publish deadline:
    // aztecSlotDuration - 2*ethereumSlotDuration = 72 - 24 = 48s, giving straggler attestations
    // 48s + 500ms grace after the receiver rolls into the target slot, so the proposer can keep
    // collecting useful attestations until right before the publish deadline.
    let epochCache: ReturnType<typeof mock<EpochCacheInterface>>;
    let pipeliningWindow: PipeliningWindow;

    beforeEach(() => {
      epochCache = mock<EpochCacheInterface>();
      epochCache.getSlotNow.mockReturnValue(SlotNumber(100));
      epochCache.getL1Constants.mockReturnValue({
        slotDuration: 72,
        ethereumSlotDuration: 12,
      } as any);
      pipeliningWindow = new PipeliningWindow(epochCache, { l1PublishingTime: 12 });
    });

    it('accepts a current-slot straggler attestation within the target-slot window', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1003000n, // 3000ms elapsed, within 48500ms straggler grace
      });

      expect(pipeliningWindow.acceptsAttestation(SlotNumber(100))).toBe(true);
    });

    it('accepts an attestation arriving well into the target slot (previously rejected past ~4.5s)', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1030000n, // 30s into the target slot — past the old 4.5s window, within the new 48.5s
      });

      expect(pipeliningWindow.acceptsAttestation(SlotNumber(100))).toBe(true);
    });

    it('rejects a current-slot attestation past the L1 publish deadline window', () => {
      epochCache.getEpochAndSlotNow.mockReturnValue({
        epoch: 1 as any,
        slot: SlotNumber(100),
        ts: 1000n,
        nowMs: 1049000n, // 49s elapsed, past the 48.5s cutoff (48s window + 500ms disparity)
      });

      expect(pipeliningWindow.acceptsAttestation(SlotNumber(100))).toBe(false);
    });
  });
});
