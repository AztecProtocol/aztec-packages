import type { RollupContract } from '@aztec/ethereum';
import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

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
    const testConstants: L1RollupConstants = {
      l1StartBlock: 0n,
      l1GenesisTime,
      slotDuration: SLOT_DURATION,
      ethereumSlotDuration: SLOT_DURATION,
      epochDuration: EPOCH_DURATION,
      proofSubmissionWindow: EPOCH_DURATION * 2,
    };

    epochCache = new EpochCache(rollupContract, 0n, testCommittee, 0n, testConstants);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should cache the validator set for the length of an epoch', async () => {
    // Initial call to get validators
    const { committee: initialCommittee } = await epochCache.getCommittee();
    expect(initialCommittee).toEqual(testCommittee);
    // Not called as we should cache with the initial validator set
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0);

    // Move time forward within the same epoch (less than EPOCH_DURATION) (x 1000 for milliseconds)
    jest.setSystemTime(Date.now() + (Number(EPOCH_DURATION * SLOT_DURATION) / 4) * 1000);

    // Add another validator to the set
    rollupContract.getCommitteeAt.mockResolvedValue([...testCommittee, extraTestValidator].map(v => v.toString()));

    // Should use cached validators
    const { committee: midEpochCommittee } = await epochCache.getCommittee();
    expect(midEpochCommittee).toEqual(testCommittee);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0); // Still cached

    // Move time forward to next epoch (x 1000 for milliseconds)
    jest.setSystemTime(Date.now() + Number(EPOCH_DURATION * SLOT_DURATION) * 1000);

    // Should fetch new validator
    const { committee: nextEpochCommittee } = await epochCache.getCommittee();
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
    const { currentProposer } = await epochCache.getProposerAttesterAddressInCurrentOrNextSlot();
    expect(currentProposer).toEqual(testCommittee[1]);

    // Move to next slot
    jest.setSystemTime(initialTime + Number(SLOT_DURATION) * 1000);
    const { currentProposer: nextProposer } = await epochCache.getProposerAttesterAddressInCurrentOrNextSlot();
    expect(nextProposer).toEqual(testCommittee[1]);

    // Move to slot that wraps around validator set
    jest.setSystemTime(initialTime + Number(SLOT_DURATION) * 3 * 1000);
    const { currentProposer: nextNextProposer } = await epochCache.getProposerAttesterAddressInCurrentOrNextSlot();
    expect(nextNextProposer).toEqual(testCommittee[0]);
  });

  it('should request to update the validator set when on the epoch boundary', async () => {
    // Set initial time to a known slot
    const initialTime = Number(l1GenesisTime) * 1000; // Convert to milliseconds
    jest.setSystemTime(initialTime);

    // Move forward to slot before the epoch boundary
    jest.setSystemTime(initialTime + Number(SLOT_DURATION) * (EPOCH_DURATION - 1) * 1000);

    // Should request to update the validator set
    await epochCache.getProposerAttesterAddressInCurrentOrNextSlot();
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);
  });

  it('should compute the correct timestamp for a given slot', async () => {
    const { l1GenesisTime, slotDuration, epochDuration } = (epochCache as any).l1constants as L1RollupConstants;

    // generate a random slot greater than `epochDuration`
    const targetSlot = BigInt(epochDuration) + BigInt(Math.floor(Math.random() * 1000));
    const targetEpoch = targetSlot / BigInt(epochDuration);
    const epochStartSlot = targetEpoch * BigInt(epochDuration);
    const epochStartTimestamp = l1GenesisTime + epochStartSlot * BigInt(slotDuration);

    const expectedCommittee = [EthAddress.fromString('0x000000000000000000000000000000000000BEEF')];
    const expectedSeed = 999n;
    rollupContract.getCommitteeAt.mockResolvedValue(expectedCommittee.map(v => v.toString()));
    rollupContract.getSampleSeedAt.mockResolvedValue(expectedSeed);

    await epochCache.getCommittee(targetSlot);

    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledWith(epochStartTimestamp);

    expect(rollupContract.getSampleSeedAt).toHaveBeenCalledTimes(1);
    expect(rollupContract.getSampleSeedAt).toHaveBeenCalledWith(epochStartTimestamp);
  });

  it('should cache multiple epochs', async () => {
    // Initial call to get validators
    const { committee: initialCommittee } = await epochCache.getCommittee();
    expect(initialCommittee).toEqual(testCommittee);

    // Move time forward to next epoch (x 1000 for milliseconds)
    jest.setSystemTime(Date.now() + Number(EPOCH_DURATION * SLOT_DURATION) * 1000);

    // Add another validator to the set
    rollupContract.getCommitteeAt.mockResolvedValue([...testCommittee, extraTestValidator].map(v => v.toString()));

    // Should fetch new validator
    const { committee: nextEpochCommittee } = await epochCache.getCommittee();
    expect(nextEpochCommittee).toEqual([...testCommittee, extraTestValidator]);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1); // Called again for new epoch
    rollupContract.getCommitteeAt.mockClear();

    // Should return the previous epoch still cached
    const { committee: initialCommitteeRerequested } = await epochCache.getCommittee(1n);
    expect(initialCommitteeRerequested).toEqual(testCommittee);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0); // Cached
  });

  it('should purge old epochs', async () => {
    // Set the cache size to 3 epochs
    (epochCache as any).config.cacheSize = 3;

    const extraValidators = [4, 5, 6, 7].map(EthAddress.fromNumber);
    const committees = times(4, i => [...testCommittee, ...extraValidators.slice(0, i)]);

    // Seed the cache with 3 epochs worth of data
    for (let i = 0; i < 3; i++) {
      rollupContract.getCommitteeAt.mockResolvedValue(committees[i].map(v => v.toString()));
      const { committee: actual } = await epochCache.getCommittee(BigInt(i * EPOCH_DURATION));
      expect(actual).toEqual(committees[i]);
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(i); // Epoch 0 is already initialized
    }

    // Requesting any of them should not call the contract again
    rollupContract.getCommitteeAt.mockClear();
    for (let i = 0; i < 3; i++) {
      const { committee: actual } = await epochCache.getCommittee(BigInt(i * EPOCH_DURATION));
      expect(actual).toEqual(committees[i]);
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0);
    }

    // Requesting another epoch should cause the oldest to be purged
    rollupContract.getCommitteeAt.mockResolvedValue(committees[3].map(v => v.toString()));
    const { committee: fourth } = await epochCache.getCommittee(BigInt(3 * EPOCH_DURATION));
    expect(fourth).toEqual(committees[3]);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);
    rollupContract.getCommitteeAt.mockClear();

    // So when going back to the first epoch, it should be re-requested from the contract
    rollupContract.getCommitteeAt.mockResolvedValue(committees[0].map(v => v.toString()));
    const { committee: first } = await epochCache.getCommittee(BigInt(0 * EPOCH_DURATION));
    expect(first).toEqual(committees[0]);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);
  });
});
