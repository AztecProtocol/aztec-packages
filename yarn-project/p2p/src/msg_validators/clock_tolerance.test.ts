import type { EpochCacheInterface } from '@aztec/epoch-cache';
import { SlotNumber } from '@aztec/foundation/branded-types';

import { mock } from 'jest-mock-extended';

import { MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS, PipeliningWindow } from './clock_tolerance.js';

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
  const SLOT = 100;
  const buildFrameStart = SLOT * S - S - E; // 100*72 - 84 = 7116
  const proposalDeadline = SLOT * S - E - D; // 7182
  const attestationDeadline = SLOT * S + S - 2 * E; // 7248

  /** Mocks the wall-clock time used by PipeliningWindow (epochCache.getEpochAndSlotNow().nowMs). */
  function mockNow(epochCache: ReturnType<typeof mock<EpochCacheInterface>>, nowSeconds: number) {
    epochCache.getEpochAndSlotNow.mockReturnValue({
      epoch: 1 as any,
      slot: SlotNumber(SLOT),
      ts: BigInt(Math.floor(nowSeconds)),
      nowMs: BigInt(Math.round(nowSeconds * 1000)),
    });
  }

  describe('PipeliningWindow.acceptsProposal', () => {
    let epochCache: ReturnType<typeof mock<EpochCacheInterface>>;
    let pipeliningWindow: PipeliningWindow;

    beforeEach(() => {
      epochCache = mock<EpochCacheInterface>();
      epochCache.getL1Constants.mockReturnValue({
        l1GenesisTime: 0n,
        slotDuration: S,
        ethereumSlotDuration: E,
      } as any);
      pipeliningWindow = new PipeliningWindow(epochCache, { blockDurationMs: D * 1000 });
    });

    it('accepts a proposal arriving inside the receive window', () => {
      mockNow(epochCache, buildFrameStart + 1);
      expect(pipeliningWindow.acceptsProposal(SlotNumber(SLOT))).toBe(true);
    });

    it('accepts a proposal at the build frame start minus clock disparity', () => {
      mockNow(epochCache, buildFrameStart - MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS / 1000);
      expect(pipeliningWindow.acceptsProposal(SlotNumber(SLOT))).toBe(true);
    });

    it('rejects a proposal arriving before the receive window opens', () => {
      mockNow(epochCache, buildFrameStart - 1);
      expect(pipeliningWindow.acceptsProposal(SlotNumber(SLOT))).toBe(false);
    });

    it('accepts a proposal at the receive deadline plus clock disparity', () => {
      mockNow(epochCache, proposalDeadline + MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS / 1000);
      expect(pipeliningWindow.acceptsProposal(SlotNumber(SLOT))).toBe(true);
    });

    it('rejects a proposal arriving after the receive deadline plus clock disparity', () => {
      mockNow(epochCache, proposalDeadline + 1);
      expect(pipeliningWindow.acceptsProposal(SlotNumber(SLOT))).toBe(false);
    });
  });

  describe('PipeliningWindow.acceptsAttestation', () => {
    let epochCache: ReturnType<typeof mock<EpochCacheInterface>>;
    let pipeliningWindow: PipeliningWindow;

    beforeEach(() => {
      epochCache = mock<EpochCacheInterface>();
      epochCache.getL1Constants.mockReturnValue({
        l1GenesisTime: 0n,
        slotDuration: S,
        ethereumSlotDuration: E,
      } as any);
      pipeliningWindow = new PipeliningWindow(epochCache, { blockDurationMs: D * 1000 });
    });

    it('accepts an attestation arriving early (at the build frame start)', () => {
      mockNow(epochCache, buildFrameStart);
      expect(pipeliningWindow.acceptsAttestation(SlotNumber(SLOT))).toBe(true);
    });

    it('accepts an attestation arriving well into the target slot (liberal window)', () => {
      mockNow(epochCache, SLOT * S + 30); // 30s into the target slot
      expect(pipeliningWindow.acceptsAttestation(SlotNumber(SLOT))).toBe(true);
    });

    it('accepts an attestation at the attestation deadline plus clock disparity', () => {
      mockNow(epochCache, attestationDeadline + MAXIMUM_GOSSIP_CLOCK_DISPARITY_MS / 1000);
      expect(pipeliningWindow.acceptsAttestation(SlotNumber(SLOT))).toBe(true);
    });

    it('rejects an attestation arriving after the attestation deadline plus clock disparity', () => {
      mockNow(epochCache, attestationDeadline + 1);
      expect(pipeliningWindow.acceptsAttestation(SlotNumber(SLOT))).toBe(false);
    });

    it('rejects an attestation arriving before the receive window opens', () => {
      mockNow(epochCache, buildFrameStart - 1);
      expect(pipeliningWindow.acceptsAttestation(SlotNumber(SLOT))).toBe(false);
    });
  });
});
