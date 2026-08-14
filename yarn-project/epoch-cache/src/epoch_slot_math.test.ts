import type { RollupContract } from '@aztec/ethereum/contracts';
import { ManualDateProvider } from '@aztec/foundation/timer';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

import { describe, expect, it } from '@jest/globals';
import { mock } from 'jest-mock-extended';

import { EpochCache } from './epoch_cache.js';
import { EpochSlotMath } from './epoch_slot_math.js';

const L1_CONSTANTS: L1RollupConstants = {
  l1StartBlock: 100n,
  l1GenesisTime: 1_700_000_000n,
  slotDuration: 24,
  epochDuration: 16,
  ethereumSlotDuration: 12,
  proofSubmissionEpochs: 2,
  targetCommitteeSize: 48,
  rollupManaLimit: Number.MAX_SAFE_INTEGER,
};

/** Builds a math-only clock and a real epoch cache sharing one frozen clock, so their outputs can be compared. */
function createPair(secondsSinceGenesis: number) {
  const dateProvider = new ManualDateProvider(Number(L1_CONSTANTS.l1GenesisTime) * 1000 + secondsSinceGenesis * 1000);
  const math = new EpochSlotMath(L1_CONSTANTS, dateProvider);
  // The rollup contract is never touched: every getter compared below is pure arithmetic over the constants.
  const epochCache = new EpochCache(
    mock<RollupContract>(),
    { ...L1_CONSTANTS, lagInEpochsForValidatorSet: 2, lagInEpochsForRandao: 1 },
    dateProvider,
  );
  return { math, epochCache };
}

describe('EpochSlotMath', () => {
  // Genesis, mid-slot, slot and epoch boundaries, and a point deep into the chain.
  const timePoints = [0, 1, 11, 12, 23, 24, 25, 383, 384, 1_000_000];

  it.each(timePoints)('agrees with EpochCache at %i seconds past genesis', seconds => {
    const { math, epochCache } = createPair(seconds);

    expect(epochCache.getL1Constants()).toMatchObject(math.getL1Constants());
    expect(math.getSlotNow()).toEqual(epochCache.getSlotNow());
    expect(math.getTargetSlot()).toEqual(epochCache.getTargetSlot());
    expect(math.getEpochNow()).toEqual(epochCache.getEpochNow());
    expect(math.getTargetEpoch()).toEqual(epochCache.getTargetEpoch());
    expect(math.getEpochAndSlotNow()).toEqual(epochCache.getEpochAndSlotNow());
    expect(math.getEpochAndSlotInNextL1Slot()).toEqual(epochCache.getEpochAndSlotInNextL1Slot());
    expect(math.getTargetEpochAndSlotInNextL1Slot()).toEqual(epochCache.getTargetEpochAndSlotInNextL1Slot());
    expect(math.getCurrentAndNextSlot()).toEqual(epochCache.getCurrentAndNextSlot());
    expect(math.getTargetAndNextSlot()).toEqual(epochCache.getTargetAndNextSlot());
  });

  it('computes slots and epochs off the rollup constants', () => {
    // 16 slots of 24s each per epoch, so epoch 1 opens at slot 16, ie 384 seconds past genesis.
    expect(createPair(0).math.getEpochAndSlotNow()).toEqual({
      slot: 0,
      epoch: 0,
      ts: L1_CONSTANTS.l1GenesisTime,
      nowMs: L1_CONSTANTS.l1GenesisTime * 1000n,
    });
    expect(createPair(23).math.getSlotNow()).toEqual(0);
    expect(createPair(24).math.getSlotNow()).toEqual(1);
    expect(createPair(383).math.getEpochNow()).toEqual(0);
    expect(createPair(384).math.getEpochNow()).toEqual(1);
  });

  it('advances the slot in the next L1 slot as the L1 slot boundary approaches', () => {
    // The L1 slot is 12s, so at 13s past genesis the next L1 block lands at 24s, which opens L2 slot 1.
    expect(createPair(11).math.getEpochAndSlotInNextL1Slot().slot).toEqual(0);
    expect(createPair(13).math.getEpochAndSlotInNextL1Slot().slot).toEqual(1);
  });
});
