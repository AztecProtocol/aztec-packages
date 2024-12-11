import { type RollupContract } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import { EpochCache } from './epoch_cache.js';

describe('EpochCache', () => {
  let rollupContract: MockProxy<RollupContract>;
  let epochCache: EpochCache;

  // Test constants
  const SLOT_DURATION = 12;
  const EPOCH_DURATION = 32; // 384 seconds
  // const L1_GENESIS_TIME = 1000n;
  let l1GenesisTime: bigint;

  const testCommittee = [
    EthAddress.fromString('0x0000000000000000000000000000000000000001'),
    EthAddress.fromString('0x0000000000000000000000000000000000000002'),
    EthAddress.fromString('0x0000000000000000000000000000000000000003'),
  ];

  const extraTestValidator = EthAddress.fromString('0x0000000000000000000000000000000000000004');

  beforeEach(() => {
    rollupContract = mock<RollupContract>();

    // Mock the getCommitteeAt method
    rollupContract.getCommitteeAt.mockResolvedValue(testCommittee.map(v => v.toString()));
    rollupContract.getSampleSeedAt.mockResolvedValue(0n);

    l1GenesisTime = BigInt(Math.floor(Date.now() / 1000));

    // Setup fake timers
    jest.useFakeTimers();

    // Initialize with test constants
    const testConstants = {
      l1StartBlock: 0n,
      l1GenesisTime,
      slotDuration: SLOT_DURATION,
      ethereumSlotDuration: SLOT_DURATION,
      epochDuration: EPOCH_DURATION,
    };

    epochCache = new EpochCache(rollupContract, testCommittee, 0n, testConstants);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should cache the validator set for the length of an epoch', async () => {
    // Initial call to get validators
    const initialCommittee = await epochCache.getCommittee();
    expect(initialCommittee).toEqual(testCommittee);
    // Not called as we should cache with the initial validator set
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0);

    // Move time forward within the same epoch (less than EPOCH_DURATION) (x 1000 for milliseconds)
    jest.setSystemTime(Date.now() + (Number(EPOCH_DURATION * SLOT_DURATION) / 4) * 1000);

    // Add another validator to the set
    rollupContract.getCommitteeAt.mockResolvedValue([...testCommittee, extraTestValidator].map(v => v.toString()));

    // Should use cached validators
    const midEpochCommittee = await epochCache.getCommittee();
    expect(midEpochCommittee).toEqual(testCommittee);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0); // Still cached

    // Move time forward to next epoch (x 1000 for milliseconds)
    jest.setSystemTime(Date.now() + Number(EPOCH_DURATION * SLOT_DURATION) * 1000);

    // Should fetch new validator
    const nextEpochCommittee = await epochCache.getCommittee();
    expect(nextEpochCommittee).toEqual([...testCommittee, extraTestValidator]);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1); // Called again for new epoch
  });

  it('should correctly get current validator based on slot number', async () => {
    // Set initial time to a known slot
    const initialTime = Number(l1GenesisTime) * 1000; // Convert to milliseconds
    jest.setSystemTime(initialTime);

    // The valid proposer has been calculated in advance to be [1,1,0] for the slots chosen
    // Hence the chosen values for testCommittee below

    // Get validator for slot 0
    const { currentProposer } = await epochCache.getProposerInCurrentOrNextSlot();
    expect(currentProposer).toEqual(testCommittee[1]);

    // Move to next slot
    jest.setSystemTime(initialTime + Number(SLOT_DURATION) * 1000);
    const { currentProposer: nextProposer } = await epochCache.getProposerInCurrentOrNextSlot();
    expect(nextProposer).toEqual(testCommittee[1]);

    // Move to slot that wraps around validator set
    jest.setSystemTime(initialTime + Number(SLOT_DURATION) * 3 * 1000);
    const { currentProposer: nextNextProposer } = await epochCache.getProposerInCurrentOrNextSlot();
    expect(nextNextProposer).toEqual(testCommittee[0]);
  });

  it('Should request to update the validator set when on the epoch boundary', async () => {
    // Set initial time to a known slot
    const initialTime = Number(l1GenesisTime) * 1000; // Convert to milliseconds
    jest.setSystemTime(initialTime);

    // Move forward to slot before the epoch boundary
    jest.setSystemTime(initialTime + Number(SLOT_DURATION) * (EPOCH_DURATION - 1) * 1000);

    // Should request to update the validator set
    await epochCache.getProposerInCurrentOrNextSlot();
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);
  });
});
