import { getPublicClient } from '@aztec/ethereum/client';
import { DefaultL1ContractsConfig } from '@aztec/ethereum/config';
import { RollupContract } from '@aztec/ethereum/contracts';
import { deployAztecL1Contracts } from '@aztec/ethereum/deploy-aztec-l1-contracts';
import { EthCheatCodes, RollupCheatCodes, startAnvil } from '@aztec/ethereum/test';
import type { Anvil } from '@aztec/ethereum/test';
import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import { SecretValue } from '@aztec/foundation/config';
import { Fr } from '@aztec/foundation/curves/bn254';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { TestDateProvider } from '@aztec/foundation/timer';

import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';

import { EpochCache, EpochNotFinalizedError, EpochNotStableError } from './epoch_cache.js';

/**
 * Integration tests for EpochCache against a real Anvil instance with deployed L1 contracts.
 *
 * These tests verify:
 * - Committee computation with real contract calls and RANDAO seeds
 * - The finalized-block guard correctly rejects epochs whose data may still change
 */
describe('EpochCache Integration', () => {
  let anvil: Anvil;
  let rpcUrl: string;
  let cheatCodes: EthCheatCodes;
  let rollupCheatCodes: RollupCheatCodes;
  let rollup: RollupContract;
  let epochCache: EpochCache;
  let dateProvider: TestDateProvider;

  const NUM_VALIDATORS = 4;
  const deployerPrivateKey = '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba' as const;

  // Use well-known funded Anvil accounts as validators
  const validatorKeys = [
    '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
    '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
    '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
    '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  ] as const;

  const validatorAddresses = validatorKeys.map(k => EthAddress.fromString(privateKeyToAccount(k).address));

  beforeAll(async () => {
    dateProvider = new TestDateProvider();

    // Start Anvil with slotsInAnEpoch=8 so finalized = latest - 16 blocks.
    // A larger value (vs 1) avoids tests passing due to off-by-one near the finality boundary.
    ({ anvil, rpcUrl } = await startAnvil({
      l1BlockTime: 1,
      slotsInAnEpoch: 8,
      dateProvider,
    }));

    cheatCodes = new EthCheatCodes([rpcUrl], dateProvider);

    const initialValidators = validatorKeys.map((_, i) => ({
      attester: validatorAddresses[i],
      withdrawer: validatorAddresses[i],
      bn254SecretKey: new SecretValue(Fr.random().toBigInt()),
    }));

    const deployed = await deployAztecL1Contracts(rpcUrl, deployerPrivateKey, foundry.id, {
      ...DefaultL1ContractsConfig,
      vkTreeRoot: Fr.random(),
      protocolContractsHash: Fr.random(),
      genesisArchiveRoot: Fr.random(),
      realVerifier: false,
      aztecTargetCommitteeSize: NUM_VALIDATORS,
      initialValidators,
    });

    rollupCheatCodes = new RollupCheatCodes(cheatCodes, deployed.l1ContractAddresses);

    const publicClient = getPublicClient({ l1RpcUrls: [rpcUrl], l1ChainId: foundry.id });
    rollup = new RollupContract(publicClient, deployed.l1ContractAddresses.rollupAddress.toString());

    // Create epoch cache from the real rollup contract.
    epochCache = await EpochCache.create(rollup, undefined, { dateProvider });
  }, 120_000);

  afterAll(async () => {
    await cheatCodes?.setIntervalMining(0);
    await anvil?.stop().catch(err => createLogger('cleanup').error(err));
  });

  describe('happy path', () => {
    it('returns committee for a finalized epoch', async () => {
      const constants = epochCache.getEpochCacheConstants();

      // Advance past the validator set lag so the epoch's data is finalized.
      const lagEpochs = Math.max(constants.lagInEpochsForValidatorSet, constants.lagInEpochsForRandao);
      const targetEpoch = EpochNumber(lagEpochs + 2);
      await rollupCheatCodes.advanceToEpoch(targetEpoch);

      // Mine enough blocks so the finalized tag catches up (finalized = latest - 16 with slotsInAnEpoch=8).
      await cheatCodes.mine(20);

      // Setup epoch so the committee commitment is stored on-chain.
      await rollupCheatCodes.setupEpoch();

      const { committee, seed, epoch } = await epochCache.getCommittee('now');

      expect(committee).toBeDefined();
      expect(committee!.length).toBe(NUM_VALIDATORS);
      expect(seed).not.toBe(0n);
      expect(epoch).toBe(targetEpoch);

      // All registered validators should be in the committee (since targetCommitteeSize == validator count).
      const committeeStrings = new Set(committee!.map(v => v.toString()));
      for (const v of validatorAddresses) {
        expect(committeeStrings.has(v.toString())).toBe(true);
      }
    }, 60_000);

    it('caches committee and returns same result within epoch', async () => {
      const first = await epochCache.getCommittee('now');
      const second = await epochCache.getCommittee('now');

      expect(first.committee).toEqual(second.committee);
      expect(first.seed).toEqual(second.seed);
      expect(first.epoch).toEqual(second.epoch);
    });

    it('computes a deterministic proposer for each slot', async () => {
      const { committee, epoch } = await epochCache.getCommittee('now');
      expect(committee).toBeDefined();
      expect(committee!.length).toBeGreaterThan(0);

      const constants = epochCache.getEpochCacheConstants();
      const startSlot = SlotNumber(Number(epoch) * constants.epochDuration);

      // Compute proposer for two different slots -- should be deterministic.
      const proposer0 = await epochCache.getProposerAttesterAddressInSlot(startSlot);
      const proposer1 = await epochCache.getProposerAttesterAddressInSlot(SlotNumber(startSlot + 1));

      expect(proposer0).toBeDefined();
      expect(proposer1).toBeDefined();

      // Both proposers should be committee members.
      const committeeStrings = new Set(committee!.map(v => v.toString()));
      expect(committeeStrings.has(proposer0!.toString())).toBe(true);
      expect(committeeStrings.has(proposer1!.toString())).toBe(true);

      // Calling again for the same slot should return the same proposer.
      const proposer0Again = await epochCache.getProposerAttesterAddressInSlot(startSlot);
      expect(proposer0Again!.equals(proposer0!)).toBe(true);
    });
  });

  describe('finalized block guard', () => {
    /**
     * To test the two rejection modes independently, we exploit the gap between the
     * L1 "latest" and "finalized" block timestamps.
     *
     * The L1 contract checks: samplingTs <= latest_block.timestamp
     * Our guard checks:       samplingTs <= finalized_block.timestamp
     *
     * By stopping interval mining and warping L1 forward in a single block, we create
     * a large gap: latest jumps far ahead while finalized (latest - 2 blocks) stays near
     * the old timestamp. We then pick:
     *
     *   - An epoch whose samplingTs lands between finalized and latest:
     *       L1 contract call succeeds, but our guard fires.
     *
     *   - An epoch whose samplingTs is beyond latest:
     *       L1 contract reverts with ValidatorSelection__EpochNotStable.
     */

    afterEach(async () => {
      // Ensure mining is restored even if a test assertion fails mid-way.
      await cheatCodes.setAutomine(true);
      await cheatCodes.setIntervalMining(1);
    });

    it('rejects with finalized-guard error when epoch is L1-stable but not finalized', async () => {
      const constants = epochCache.getEpochCacheConstants();
      const { lagInEpochsForRandao, epochDuration, slotDuration } = constants;
      const l1GenesisTime = constants.l1GenesisTime;
      const lagSeconds = BigInt(lagInEpochsForRandao) * BigInt(epochDuration) * BigInt(slotDuration);
      const epochSeconds = BigInt(epochDuration) * BigInt(slotDuration);

      // Stop interval mining so we control exactly how many blocks exist.
      await cheatCodes.setIntervalMining(0);
      await cheatCodes.setAutomine(false);

      // Warp latest forward by many epochs in a single block, creating a large gap.
      const latestTs = (await rollup.client.getBlock()).timestamp;
      const jumpSeconds = 20n * epochSeconds;
      await cheatCodes.warp(Number(latestTs + jumpSeconds));

      // After warp: latest is at latestTs + jumpSeconds, finalized is ~2 blocks back.
      // With only 1 new block mined, finalized timestamp is still near preFinalizedTs.
      const postLatestTs = (await rollup.client.getBlock()).timestamp;
      const postFinalizedTs = (await rollup.client.getBlock({ blockTag: 'finalized' })).timestamp;

      // Find an epoch whose samplingTs is between finalized and latest.
      // samplingTs(E) = l1GenesisTime + E * epochDuration * slotDuration - lagSeconds
      // We need: postFinalizedTs < samplingTs <= postLatestTs
      // So: postFinalizedTs < l1GenesisTime + E * epochSeconds - lagSeconds <= postLatestTs
      // E > (postFinalizedTs - l1GenesisTime + lagSeconds) / epochSeconds
      // E <= (postLatestTs - l1GenesisTime + lagSeconds) / epochSeconds
      const minEpoch = (postFinalizedTs - l1GenesisTime + lagSeconds) / epochSeconds + 1n;
      const maxEpoch = (postLatestTs - l1GenesisTime + lagSeconds) / epochSeconds;

      expect(maxEpoch).toBeGreaterThan(minEpoch);

      // Pick an epoch in the middle of the valid range. Use the first slot of that epoch
      // so ts equals the epoch start exactly.
      const targetEpoch = minEpoch + (maxEpoch - minEpoch) / 2n;
      const targetSlot = SlotNumber(Number(targetEpoch) * epochDuration);

      // Verify our assumptions: sampling timestamp is between finalized and latest.
      const samplingTs = l1GenesisTime + BigInt(targetSlot) * BigInt(slotDuration) - lagSeconds;
      expect(samplingTs).toBeGreaterThan(postFinalizedTs);
      expect(samplingTs).toBeLessThanOrEqual(postLatestTs);

      await expect(epochCache.getCommittee(targetSlot)).rejects.toThrow(EpochNotFinalizedError);
    }, 60_000);

    it('rejects with EpochNotStable when epoch is beyond L1 latest', async () => {
      const constants = epochCache.getEpochCacheConstants();
      const { lagInEpochsForRandao, epochDuration, slotDuration } = constants;
      const l1GenesisTime = constants.l1GenesisTime;
      const lagSeconds = BigInt(lagInEpochsForRandao) * BigInt(epochDuration) * BigInt(slotDuration);
      const epochSeconds = BigInt(epochDuration) * BigInt(slotDuration);

      // Get the current latest timestamp.
      const latestTs = (await rollup.client.getBlock()).timestamp;

      // Find the first epoch whose samplingTs exceeds latest.
      // samplingTs(E) = l1GenesisTime + E * epochSeconds - lagSeconds > latestTs
      // E > (latestTs - l1GenesisTime + lagSeconds) / epochSeconds
      const firstUnstableEpoch = (latestTs - l1GenesisTime + lagSeconds) / epochSeconds + 1n;

      // Query the mid-slot of that epoch to account for being "halfway through".
      const midSlot = SlotNumber(Number(firstUnstableEpoch) * epochDuration + Math.floor(epochDuration / 2));

      // Verify: the sampling timestamp for this slot is beyond latest.
      const samplingTs = l1GenesisTime + BigInt(midSlot) * BigInt(slotDuration) - lagSeconds;
      expect(samplingTs).toBeGreaterThan(latestTs);

      await expect(epochCache.getCommittee(midSlot)).rejects.toThrow(EpochNotStableError);
    });
  });
});
