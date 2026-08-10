import type { RollupContract } from '@aztec/ethereum/contracts';
import type { ViemPublicClient } from '@aztec/ethereum/types';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { Buffer32 } from '@aztec/foundation/buffer';
import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';
import type { GetBlockReturnType } from 'viem';

import { EpochCache, type EpochCommitteeInfo } from './epoch_cache.js';
import { PROPOSER_PIPELINING_SLOT_OFFSET } from './epoch_slot_math.js';

class TestEpochCache extends EpochCache {
  /** Seeds the cache with a finalized entry so tests don't need to hit the mock rollup for known epochs. */
  public seedCache(epoch: EpochNumber, committeeInfo: EpochCommitteeInfo): void {
    this.cache.set(epoch, {
      data: committeeInfo,
      lastQueryL1BlockNumber: 0n,
      lastQueryL1BlockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      lastRefreshL1Timestamp: BigInt(Math.floor(Date.now() / 1000)) + 10000n,
      finalized: true,
    });
  }

  public setCacheSize(size: number): void {
    this.config.cacheSize = size;
  }
}

describe('EpochCache', () => {
  let rollupContract: MockProxy<RollupContract>;
  let epochCache: TestEpochCache;
  let client: MockProxy<ViemPublicClient>;

  // Test constants
  const SLOT_DURATION = 12;
  const EPOCH_DURATION = 32; // 384 seconds
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
    rollupContract.getCommitteeAt.mockResolvedValue(testCommittee);
    rollupContract.getSampleSeedAt.mockResolvedValue(Buffer32.fromBigInt(0n));
    rollupContract.getAttesters.mockResolvedValue(testCommittee);
    rollupContract.isEscapeHatchOpen.mockResolvedValue(false);

    l1GenesisTime = BigInt(Math.floor(Date.now() / 1000));

    // Mock the client.getBlock method for timestamp retrieval.
    // Return a timestamp far enough in the future to accommodate test queries.
    // lagInEpochsForRandao * epochDuration * slotDuration = 2 * 32 * 12 = 768 seconds
    // Add extra buffer for random slots in tests (e.g., 1000 slots = 12000 seconds)
    client = mock<ViemPublicClient>();
    const futureTimestamp = l1GenesisTime + BigInt(768 + 12000);
    client.getBlock.mockResolvedValue({
      timestamp: futureTimestamp,
      number: 100n,
      hash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
    } as unknown as GetBlockReturnType);
    (rollupContract as any).client = client;

    // Setup fake timers
    jest.useFakeTimers();

    // Initialize with test constants
    const testConstants: L1RollupConstants & { lagInEpochsForValidatorSet: number; lagInEpochsForRandao: number } = {
      l1StartBlock: 0n,
      l1GenesisTime,
      slotDuration: SLOT_DURATION,
      ethereumSlotDuration: SLOT_DURATION,
      epochDuration: EPOCH_DURATION,
      proofSubmissionEpochs: 1,
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
      lagInEpochsForValidatorSet: 2,
      lagInEpochsForRandao: 2,
    };

    epochCache = new TestEpochCache(rollupContract, testConstants);
    // Initialize the cache with the initial epoch's committee
    epochCache.seedCache(EpochNumber(0), {
      epoch: EpochNumber(0),
      committee: testCommittee,
      seed: 0n,
      isEscapeHatchOpen: false,
    });
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
    rollupContract.getCommitteeAt.mockResolvedValue([...testCommittee, extraTestValidator]);

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
    const { currentSlot } = epochCache.getCurrentAndNextSlot();
    const currentProposer = await epochCache.getProposerAttesterAddressInSlot(currentSlot);
    expect(currentProposer).toEqual(testCommittee[1]);

    // Move to next slot
    jest.setSystemTime(initialTime + Number(SLOT_DURATION) * 1000);
    const { currentSlot: nextSlot } = epochCache.getCurrentAndNextSlot();
    const nextProposer = await epochCache.getProposerAttesterAddressInSlot(nextSlot);
    expect(nextProposer).toEqual(testCommittee[1]);

    // Move to slot that wraps around validator set
    jest.setSystemTime(initialTime + Number(SLOT_DURATION) * 3 * 1000);
    const { currentSlot: nextNextSlot } = epochCache.getCurrentAndNextSlot();
    const nextNextProposer = await epochCache.getProposerAttesterAddressInSlot(nextNextSlot);
    expect(nextNextProposer).toEqual(testCommittee[0]);
  });

  it('should request to update the validator set when on the epoch boundary', async () => {
    // Set initial time to a known slot
    const initialTime = Number(l1GenesisTime) * 1000; // Convert to milliseconds
    jest.setSystemTime(initialTime);

    // Move forward to slot before the epoch boundary
    jest.setSystemTime(initialTime + Number(SLOT_DURATION) * (EPOCH_DURATION - 1) * 1000);

    // Should request to update the validator set
    const { nextSlot } = epochCache.getCurrentAndNextSlot();
    await epochCache.getProposerAttesterAddressInSlot(nextSlot);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);
  });

  it('should compute the correct timestamp for a given slot', async () => {
    const { l1GenesisTime, slotDuration, epochDuration } = epochCache.getL1Constants();

    // generate a random slot greater than `epochDuration`
    const targetSlot = BigInt(epochDuration) + BigInt(Math.floor(Math.random() * 1000));
    const slotTimestamp = l1GenesisTime + targetSlot * BigInt(slotDuration);

    const expectedCommittee = [EthAddress.fromString('0x000000000000000000000000000000000000BEEF')];
    const expectedSeed = Buffer32.fromBigInt(999n);
    rollupContract.getCommitteeAt.mockResolvedValue(expectedCommittee);
    rollupContract.getSampleSeedAt.mockResolvedValue(expectedSeed);

    await epochCache.getCommittee(SlotNumber.fromBigInt(targetSlot));

    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledWith(slotTimestamp);

    expect(rollupContract.getSampleSeedAt).toHaveBeenCalledTimes(1);
    expect(rollupContract.getSampleSeedAt).toHaveBeenCalledWith(slotTimestamp);
  });

  it('should cache multiple epochs', async () => {
    // Initial call to get validators
    const { committee: initialCommittee } = await epochCache.getCommittee();
    expect(initialCommittee).toEqual(testCommittee);

    // Move time forward to next epoch (x 1000 for milliseconds)
    jest.setSystemTime(Date.now() + Number(EPOCH_DURATION * SLOT_DURATION) * 1000);

    // Add another validator to the set
    rollupContract.getCommitteeAt.mockResolvedValue([...testCommittee, extraTestValidator]);

    // Should fetch new validator
    const { committee: nextEpochCommittee } = await epochCache.getCommittee();
    expect(nextEpochCommittee).toEqual([...testCommittee, extraTestValidator]);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1); // Called again for new epoch
    rollupContract.getCommitteeAt.mockClear();

    // Should return the previous epoch still cached (SlotNumber(1) is a slot number, not an epoch)
    const { committee: initialCommitteeRerequested } = await epochCache.getCommittee(SlotNumber(1));
    expect(initialCommitteeRerequested).toEqual(testCommittee);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0); // Cached
  });

  it('should purge old epochs', async () => {
    // Set the cache size to 3 epochs
    epochCache.setCacheSize(3);

    const extraValidators = [4, 5, 6, 7].map(EthAddress.fromNumber);
    const committees = times(4, i => [...testCommittee, ...extraValidators.slice(0, i)]);

    // Seed the cache with 3 epochs worth of data
    for (let i = 0; i < 3; i++) {
      rollupContract.getCommitteeAt.mockResolvedValue(committees[i]);
      const { committee: actual } = await epochCache.getCommittee(SlotNumber(i * EPOCH_DURATION));
      expect(actual).toEqual(committees[i]);
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(i); // Epoch 0 is already initialized
    }

    // Requesting any of them should not call the contract again
    rollupContract.getCommitteeAt.mockClear();
    for (let i = 0; i < 3; i++) {
      const { committee: actual } = await epochCache.getCommittee(SlotNumber(i * EPOCH_DURATION));
      expect(actual).toEqual(committees[i]);
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0);
    }

    // Requesting another epoch should cause the oldest to be purged
    rollupContract.getCommitteeAt.mockResolvedValue(committees[3]);
    const { committee: fourth } = await epochCache.getCommittee(SlotNumber(3 * EPOCH_DURATION));
    expect(fourth).toEqual(committees[3]);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);
    rollupContract.getCommitteeAt.mockClear();

    // So when going back to the first epoch, it should be re-requested from the contract
    rollupContract.getCommitteeAt.mockResolvedValue(committees[0]);
    const { committee: first } = await epochCache.getCommittee(SlotNumber(0 * EPOCH_DURATION));
    expect(first).toEqual(committees[0]);
    expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);
  });

  it('should return all validators', async () => {
    let testTime = new Date();
    jest.setSystemTime(testTime);
    const initialValidators = times(100, i => EthAddress.fromNumber(i + 1));
    const updatedValidators = times(100, i => EthAddress.fromNumber(i + 101));
    rollupContract.getAttesters.mockResolvedValueOnce(initialValidators);
    const validators = await epochCache.getRegisteredValidators();
    expect(validators.map(v => v.toString())).toEqual(initialValidators.map(v => v.toString()));
    expect(rollupContract.getAttesters).toHaveBeenCalledTimes(1);

    // Move forward 30 seconds and it should return the cached attesters
    testTime = new Date(testTime.getTime() + 30 * 1000);
    jest.setSystemTime(testTime);
    const validators2 = await epochCache.getRegisteredValidators();
    expect(validators2.map(v => v.toString())).toEqual(initialValidators.map(v => v.toString()));
    expect(rollupContract.getAttesters).toHaveBeenCalledTimes(1);

    // Move forward in time past 60 seconds and we should query the contract again
    testTime = new Date(testTime.getTime() + 31 * 1000);
    jest.setSystemTime(testTime);
    rollupContract.getAttesters.mockResolvedValueOnce(updatedValidators);
    const validators3 = await epochCache.getRegisteredValidators();
    expect(validators3.map(v => v.toString())).toEqual(updatedValidators.map(v => v.toString()));
    expect(rollupContract.getAttesters).toHaveBeenCalledTimes(2);
  });

  it('should throw error when querying committee for future epoch beyond lag', async () => {
    const { l1GenesisTime, epochDuration } = epochCache.getL1Constants();

    // Mock the client to return a current L1 timestamp that's close to genesis
    const currentL1Timestamp = l1GenesisTime + BigInt(100); // Just 100 seconds after genesis
    client.getBlock.mockResolvedValue({
      timestamp: currentL1Timestamp,
      number: 1n,
      hash: '0x0000000000000000000000000000000000000000000000000000000000000001',
    } as unknown as GetBlockReturnType);

    // Calculate a slot far in the future (epoch 100) that's definitely not cached
    // and is beyond the allowed lag
    const futureEpoch = BigInt(100);
    const futureSlot = futureEpoch * BigInt(epochDuration);

    // Attempt to get committee for this future slot should throw
    await expect(epochCache.getCommittee(SlotNumber.fromBigInt(futureSlot))).rejects.toThrow(
      /Cannot query committee for future epoch.*sampling timestamp.*beyond latest L1 block/,
    );
  });

  describe('TTL-based caching', () => {
    it('should do a lightweight refresh (no full re-fetch) after TTL if no reorg', async () => {
      const epoch1Slot = SlotNumber(EPOCH_DURATION);
      const samplingTs =
        l1GenesisTime + BigInt(EPOCH_DURATION * SLOT_DURATION) - BigInt(2 * EPOCH_DURATION * SLOT_DURATION);

      const mockBlock = () => {
        const nowSec = BigInt(Math.floor(Date.now() / 1000));
        return (args: any) => {
          if (args?.blockTag === 'finalized') {
            return Promise.resolve({ timestamp: samplingTs - 1n, number: 50n, hash: '0xaaa' } as any);
          }
          // Return the SAME hash for blockNumber queries (no reorg)
          if (args?.blockNumber !== undefined) {
            return Promise.resolve({ timestamp: nowSec, number: args.blockNumber, hash: '0xbbb' } as any);
          }
          return Promise.resolve({ timestamp: nowSec, number: 100n, hash: '0xbbb' } as any);
        };
      };

      client.getBlock.mockImplementation(mockBlock());
      rollupContract.getCommitteeAt.mockResolvedValue(testCommittee);
      rollupContract.getSampleSeedAt.mockResolvedValue(Buffer32.fromBigInt(42n));

      // First call: full fetch
      const result1 = await epochCache.getCommittee(epoch1Slot);
      expect(result1.committee).toEqual(testCommittee);
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);
      rollupContract.getCommitteeAt.mockClear();

      // Advance past TTL
      jest.setSystemTime(Date.now() + SLOT_DURATION * 1000);
      client.getBlock.mockImplementation(mockBlock());

      // After TTL: lightweight refresh — block hash matches, so NO call to getCommitteeAt
      const result2 = await epochCache.getCommittee(epoch1Slot);
      expect(result2.committee).toEqual(testCommittee); // same data, no reorg
      expect(result2.seed).toBe(42n);
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0);
    });

    it('should do a full re-fetch after TTL if a reorg is detected', async () => {
      const epoch1Slot = SlotNumber(EPOCH_DURATION);
      const samplingTs =
        l1GenesisTime + BigInt(EPOCH_DURATION * SLOT_DURATION) - BigInt(2 * EPOCH_DURATION * SLOT_DURATION);

      const mockBlock = (hash: string) => {
        const nowSec = BigInt(Math.floor(Date.now() / 1000));
        return (args: any) => {
          if (args?.blockTag === 'finalized') {
            return Promise.resolve({ timestamp: samplingTs - 1n, number: 50n, hash: '0xfin' } as any);
          }
          if (args?.blockNumber !== undefined) {
            return Promise.resolve({ timestamp: nowSec, number: args.blockNumber, hash } as any);
          }
          return Promise.resolve({ timestamp: nowSec, number: 100n, hash } as any);
        };
      };

      client.getBlock.mockImplementation(mockBlock('0xoriginal'));
      rollupContract.getCommitteeAt.mockResolvedValue(testCommittee);
      rollupContract.getSampleSeedAt.mockResolvedValue(Buffer32.fromBigInt(42n));

      await epochCache.getCommittee(epoch1Slot);
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);
      rollupContract.getCommitteeAt.mockClear();

      // Advance past TTL
      jest.setSystemTime(Date.now() + SLOT_DURATION * 1000);

      // Simulate reorg: block at the same number now has a different hash
      const updatedCommittee = [...testCommittee, extraTestValidator];
      client.getBlock.mockImplementation(mockBlock('0xreorged'));
      rollupContract.getCommitteeAt.mockResolvedValue(updatedCommittee);
      rollupContract.getSampleSeedAt.mockResolvedValue(Buffer32.fromBigInt(99n));

      const result = await epochCache.getCommittee(epoch1Slot);
      expect(result.committee).toEqual(updatedCommittee);
      expect(result.seed).toBe(99n);
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1); // full re-fetch
    });

    it('should NOT re-query finalized data after ethereumSlotDuration', async () => {
      const epoch1Slot = SlotNumber(EPOCH_DURATION);
      const epoch1Ts = l1GenesisTime + BigInt(EPOCH_DURATION * SLOT_DURATION);
      const latestTs = epoch1Ts + 10000n;
      // Finalized block is far enough that sampling ts <= finalizedTs
      const finalizedTs = epoch1Ts + 10000n;

      client.getBlock.mockImplementation((args: any) => {
        if (args?.blockTag === 'finalized') {
          return Promise.resolve({ timestamp: finalizedTs, number: 90n, hash: '0xccc' } as any);
        }
        return Promise.resolve({ timestamp: latestTs, number: 100n, hash: '0xddd' } as any);
      });

      rollupContract.getCommitteeAt.mockResolvedValue(testCommittee);
      rollupContract.getSampleSeedAt.mockResolvedValue(Buffer32.fromBigInt(42n));

      await epochCache.getCommittee(epoch1Slot);
      expect(epochCache.isFinalized(EpochNumber(1))).toBe(true);
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);

      // Advance well past TTL
      jest.setSystemTime(Date.now() + SLOT_DURATION * 10 * 1000);
      rollupContract.getCommitteeAt.mockClear();

      // Should still return cached data, no re-query
      await epochCache.getCommittee(epoch1Slot);
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0);
    });

    it('should coalesce concurrent requests for the same epoch', async () => {
      const epoch1Slot = SlotNumber(EPOCH_DURATION);
      const epoch1Ts = l1GenesisTime + BigInt(EPOCH_DURATION * SLOT_DURATION);
      const latestTs = epoch1Ts + 10000n;

      client.getBlock.mockResolvedValue({
        timestamp: latestTs,
        number: 100n,
        hash: '0xeee',
      } as any);

      let resolveCommittee: (v: EthAddress[]) => void;
      rollupContract.getCommitteeAt.mockImplementation(() => new Promise(resolve => (resolveCommittee = resolve)));
      rollupContract.getSampleSeedAt.mockResolvedValue(Buffer32.fromBigInt(0n));

      // Fire two concurrent requests
      const p1 = epochCache.getCommittee(epoch1Slot);
      const p2 = epochCache.getCommittee(epoch1Slot);

      // Only one L1 call should be in-flight
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(1);

      // Resolve and both promises should return the same result
      resolveCommittee!(testCommittee);
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1.committee).toEqual(testCommittee);
      expect(r2.committee).toEqual(testCommittee);
    });

    it('should eventually mark a non-finalized entry as finalized on re-query', async () => {
      const epoch1Slot = SlotNumber(EPOCH_DURATION);
      const epoch1Ts = l1GenesisTime + BigInt(EPOCH_DURATION * SLOT_DURATION);
      const samplingTs = epoch1Ts - BigInt(2 * EPOCH_DURATION * SLOT_DURATION); // lag=2
      const nowSec = BigInt(Math.floor(Date.now() / 1000));

      // First call: not finalized (finalized block behind sampling ts)
      client.getBlock.mockImplementation((args: any) => {
        if (args?.blockTag === 'finalized') {
          return Promise.resolve({ timestamp: samplingTs - 1n, number: 50n, hash: '0xf1' } as any);
        }
        return Promise.resolve({ timestamp: nowSec, number: 100n, hash: '0xf2' } as any);
      });

      rollupContract.getCommitteeAt.mockResolvedValue(testCommittee);
      rollupContract.getSampleSeedAt.mockResolvedValue(Buffer32.fromBigInt(42n));

      await epochCache.getCommittee(epoch1Slot);
      expect(epochCache.isFinalized(EpochNumber(1))).toBe(false);

      // Advance past TTL
      jest.setSystemTime(Date.now() + SLOT_DURATION * 1000);
      const newNowSec = BigInt(Math.floor(Date.now() / 1000));

      // Second call: now finalized (finalized block caught up)
      client.getBlock.mockImplementation((args: any) => {
        if (args?.blockTag === 'finalized') {
          return Promise.resolve({ timestamp: samplingTs + 1n, number: 90n, hash: '0xf3' } as any);
        }
        return Promise.resolve({ timestamp: newNowSec, number: 110n, hash: '0xf4' } as any);
      });

      await epochCache.getCommittee(epoch1Slot);
      expect(epochCache.isFinalized(EpochNumber(1))).toBe(true);
    });

    it('treats entries as not finalized when L1 has no finalized block yet', async () => {
      const epoch1Slot = SlotNumber(EPOCH_DURATION);
      const epoch1Ts = l1GenesisTime + BigInt(EPOCH_DURATION * SLOT_DURATION);
      const latestTs = epoch1Ts + 10000n;

      client.getBlock.mockImplementation((args: any) => {
        if (args?.blockTag === 'finalized') {
          return Promise.reject(new Error('finalized block not found'));
        }
        return Promise.resolve({ timestamp: latestTs, number: 100n, hash: '0xddd' } as any);
      });

      rollupContract.getCommitteeAt.mockResolvedValue(testCommittee);
      rollupContract.getSampleSeedAt.mockResolvedValue(Buffer32.fromBigInt(42n));

      const result = await epochCache.getCommittee(epoch1Slot);
      expect(result.committee).toEqual(testCommittee);
      expect(epochCache.isFinalized(EpochNumber(1))).toBe(false);

      // Advance past TTL; should re-query since entry is not finalized.
      jest.setSystemTime(Date.now() + SLOT_DURATION * 1000);
      rollupContract.getCommitteeAt.mockClear();
      await epochCache.getCommittee(epoch1Slot);
      expect(rollupContract.getCommitteeAt).toHaveBeenCalledTimes(0); // lightweight refresh
    });
  });

  describe('proposer pipelining', () => {
    it('getTargetSlot() returns slotNow + 1', () => {
      const initialTime = Number(l1GenesisTime) * 1000;
      jest.setSystemTime(initialTime);

      const slotNow = epochCache.getSlotNow();
      expect(epochCache.getTargetSlot()).toEqual(SlotNumber(slotNow + PROPOSER_PIPELINING_SLOT_OFFSET));
    });

    it('getTargetEpoch() returns epoch for slotNow + 1', () => {
      // Set time to mid-epoch 0
      const midEpochSlot = 5;
      const initialTime = (Number(l1GenesisTime) + midEpochSlot * SLOT_DURATION) * 1000;
      jest.setSystemTime(initialTime);

      // Target slot is midEpochSlot + 1, still within epoch 0
      expect(epochCache.getTargetEpoch()).toEqual(EpochNumber(0));
    });

    it('getTargetEpochAndSlotInNextL1Slot() returns nextL1Slot + 1', () => {
      const initialTime = Number(l1GenesisTime) * 1000;
      jest.setSystemTime(initialTime);

      const baseResult = epochCache.getEpochAndSlotInNextL1Slot();
      const targetResult = epochCache.getTargetEpochAndSlotInNextL1Slot();

      expect(targetResult.slot).toEqual(SlotNumber(baseResult.slot + PROPOSER_PIPELINING_SLOT_OFFSET));
    });

    it('getTargetEpochAndSlotInNextL1Slot() handles epoch boundary', () => {
      // Set time to last slot of epoch 0 (slot EPOCH_DURATION - 1)
      const lastSlot = EPOCH_DURATION - 1;
      const initialTime = (Number(l1GenesisTime) + lastSlot * SLOT_DURATION) * 1000;
      jest.setSystemTime(initialTime);

      const targetResult = epochCache.getTargetEpochAndSlotInNextL1Slot();

      // The target slot should be at least EPOCH_DURATION (first slot of epoch 1)
      expect(targetResult.slot).toBeGreaterThanOrEqual(EPOCH_DURATION);
      expect(targetResult.epoch).toEqual(EpochNumber(1));
    });

    it('getTargetAndNextSlot() applies pipeline offset', () => {
      const initialTime = Number(l1GenesisTime) * 1000;
      jest.setSystemTime(initialTime);

      const slotNow = epochCache.getSlotNow();
      const { targetSlot, nextSlot } = epochCache.getTargetAndNextSlot();

      expect(targetSlot).toEqual(SlotNumber(slotNow + PROPOSER_PIPELINING_SLOT_OFFSET));
      expect(nextSlot).toEqual(epochCache.getTargetEpochAndSlotInNextL1Slot().slot);
    });
  });
});
