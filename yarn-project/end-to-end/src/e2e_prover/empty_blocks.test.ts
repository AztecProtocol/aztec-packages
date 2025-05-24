import { EthAddress, retryUntil } from '@aztec/aztec.js';
import { type ExtendedViemWalletClient, RollupContract } from '@aztec/ethereum';
import { parseBooleanEnv } from '@aztec/foundation/config';
import { RewardDistributorAbi } from '@aztec/l1-artifacts';

import '@jest/globals';
import { type GetContractReturnType, getContract } from 'viem';

import { FullProverTest } from './e2e_prover_test.js';

// Set a very long 20 minute timeout.
const TIMEOUT = 1_200_000;

describe('full_prover', () => {
  const REAL_PROOFS = !parseBooleanEnv(process.env.FAKE_PROOFS);
  const COINBASE_ADDRESS = EthAddress.random();
  const t = new FullProverTest('full_prover', 1, COINBASE_ADDRESS, REAL_PROOFS);

  let { logger, cheatCodes } = t;

  let rollup: RollupContract;
  let rewardDistributor: GetContractReturnType<typeof RewardDistributorAbi, ExtendedViemWalletClient>;

  beforeAll(async () => {
    t.logger.warn(`Running suite with ${REAL_PROOFS ? 'real' : 'fake'} proofs`);

    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    await t.deployVerifier();

    ({ logger, cheatCodes } = t);

    rollup = new RollupContract(t.l1Contracts.l1Client, t.l1Contracts.l1ContractAddresses.rollupAddress);

    rewardDistributor = getContract({
      abi: RewardDistributorAbi,
      address: t.l1Contracts.l1ContractAddresses.rewardDistributorAddress.toString(),
      client: t.l1Contracts.l1Client,
    });
  }, 120_000);

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it(
    'proves empty blocks',
    async () => {
      logger.info(`Starting test with empty blocks`);

      const startBlockNumber = await t.aztecNode.getBlockNumber();
      logger.info(`Producing an empty block after ${startBlockNumber}`);
      await t.aztecNodeAdmin.flushTxs();
      await retryUntil(async () => (await t.aztecNode.getBlockNumber()) > startBlockNumber);

      const emptyBlockNumber = await t.aztecNode.getBlockNumber();
      const emptyBlock = await t.aztecNode.getBlock(emptyBlockNumber);
      expect(emptyBlock?.getStats().txCount).toEqual(0);
      logger.info(`Empty block number: ${emptyBlockNumber}`);

      // Warp to the next epoch
      const epoch = await cheatCodes.rollup.getEpoch();
      logger.info(`Advancing from epoch ${epoch} to next epoch`);

      const rewardsBeforeCoinbase = await rollup.getSequencerRewards(COINBASE_ADDRESS);
      const rewardsBeforeProver = await rollup.getSpecificProverRewardsForEpoch(epoch, t.proverAddress);
      const oldProvenBlockNumber = await rollup.getProvenBlockNumber();

      await cheatCodes.rollup.advanceToNextEpoch();

      logger.info(`Awaiting proof for the previous epoch`);
      await retryUntil(async () => (await t.aztecNode.getProvenBlockNumber()) > oldProvenBlockNumber);

      const newProvenBlockNumber = await rollup.getProvenBlockNumber();
      expect(newProvenBlockNumber).toBeGreaterThan(oldProvenBlockNumber);
      expect(await rollup.getBlockNumber()).toBe(newProvenBlockNumber);

      logger.info(`Checking rewards for coinbase: ${COINBASE_ADDRESS.toString()}`);
      const rewardsAfterCoinbase = await rollup.getSequencerRewards(COINBASE_ADDRESS);
      expect(rewardsAfterCoinbase).toBeGreaterThan(rewardsBeforeCoinbase);

      const rewardsAfterProver = await rollup.getSpecificProverRewardsForEpoch(epoch, t.proverAddress);
      expect(rewardsAfterProver).toBeGreaterThan(rewardsBeforeProver);

      const blockReward = (await rewardDistributor.read.BLOCK_REWARD()) as bigint;
      const fees = (
        await Promise.all([
          t.aztecNode.getBlock(Number(newProvenBlockNumber - 1n)),
          t.aztecNode.getBlock(Number(newProvenBlockNumber)),
        ])
      ).map(b => b!.header.totalFees.toBigInt());

      const totalRewards = fees.map(fee => fee + blockReward).reduce((acc, reward) => acc + reward, 0n);
      const sequencerGain = rewardsAfterCoinbase - rewardsBeforeCoinbase;
      const proverGain = rewardsAfterProver - rewardsBeforeProver;

      // May be less than totalRewards due to burn.
      expect(sequencerGain + proverGain).toBeLessThanOrEqual(totalRewards);
    },
    TIMEOUT,
  );
});
