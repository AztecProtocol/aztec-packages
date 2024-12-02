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
  const L1_GENESIS_TIME = 1000n;

  const testValidators = [
    EthAddress.fromString('0x0000000000000000000000000000000000000001'),
    EthAddress.fromString('0x0000000000000000000000000000000000000002'),
    EthAddress.fromString('0x0000000000000000000000000000000000000003'),
  ];

  const extraTestValidator = EthAddress.fromString('0x0000000000000000000000000000000000000004');

  beforeEach(() => {
    rollupContract = mock<RollupContract>();

    // Mock the getCommitteeAt method
    rollupContract.getCommitteeAt.mockResolvedValue(testValidators.map(v => v.toString()));

    // Setup fake timers
    jest.useFakeTimers();

    // Initialize with test constants
    const testConstants = {
      l1StartBlock: 0n,
      l1GenesisTime: L1_GENESIS_TIME,
      slotDuration: SLOT_DURATION,
      ethereumSlotDuration: SLOT_DURATION,
      epochDuration: EPOCH_DURATION,
    };

    epochCache = new EpochCache(rollupContract, testValidators, testConstants);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should cache the validator set for the length of an epoch', async () => {
    // Initial call to get validators
    const initialValidators = await epochCache.getValidatorSet();
    expect(initialValidators).toEqual(testValidators);
    // Not called as we should cache with the initial validator set
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0);

    // Move time forward within the same epoch (less than EPOCH_DURATION) (x 1000 for milliseconds)
    jest.setSystemTime(Date.now() + (Number(EPOCH_DURATION * SLOT_DURATION) / 2) * 1000);

    // Add another validator to the set
    rollupContract.getCommitteeAt.mockResolvedValue([...testValidators, extraTestValidator].map(v => v.toString()));

    // Should use cached validators
    const midEpochValidators = await epochCache.getValidatorSet();
    expect(midEpochValidators).toEqual(testValidators);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0); // Still cached

    // Move time forward to next epoch (x 1000 for milliseconds)
    jest.setSystemTime(Date.now() + Number(EPOCH_DURATION * SLOT_DURATION) * 1000);

    // Should fetch new validators
    const nextEpochValidators = await epochCache.getValidatorSet();
    expect(nextEpochValidators).toEqual([...testValidators, extraTestValidator]);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1); // Called again for new epoch
  });

  it('should correctly get current validator based on slot number', async () => {
    // Set initial time to a known slot
    const initialTime = Number(L1_GENESIS_TIME) * 1000; // Convert to milliseconds
    jest.setSystemTime(initialTime);

    // Get validator for slot 0
    let currentValidator = await epochCache.getCurrentValidator();
    expect(currentValidator).toEqual(testValidators[0]); // First validator for slot 0

    // Move to next slot
    jest.setSystemTime(initialTime + Number(SLOT_DURATION) * 1000);
    currentValidator = await epochCache.getCurrentValidator();
    expect(currentValidator).toEqual(testValidators[1]); // Second validator for slot 1

    // Move to slot that wraps around validator set
    jest.setSystemTime(initialTime + Number(SLOT_DURATION) * 3 * 1000);
    currentValidator = await epochCache.getCurrentValidator();
    expect(currentValidator).toEqual(testValidators[0]); // Back to first validator for slot 3
  });
});
