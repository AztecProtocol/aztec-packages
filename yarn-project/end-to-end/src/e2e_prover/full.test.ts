import { type AztecAddress, EthAddress, waitForProven } from '@aztec/aztec.js';

import '@jest/globals';

import { type ProverTestContext, setupProverTestEnvironment } from './shared_prover_test_setup.js';

export const TIMEOUT = 1_200_000;

// This makes AVM proving throw if there's a failure.
//process.env.AVM_PROVING_STRICT = '1';
// TODO(dbanks12): re-enable ^ after debugging and fixing AVM proving failures.

describe('full_prover', () => {
  const COINBASE_ADDRESS = EthAddress.random();
  let ctx: ProverTestContext;

  let sender: AztecAddress;
  let recipient: AztecAddress;

  beforeAll(async () => {
    ctx = await setupProverTestEnvironment('full_prover', COINBASE_ADDRESS);
    sender = ctx.sender;
    recipient = ctx.recipient;
  }, 120_000);

  afterAll(async () => {
    await ctx.t.teardown();
  });

  afterEach(async () => {
    await ctx.tokenSim.check();
  });

  it(
    'makes both public and private transfers',
    async () => {
      ctx.logger.info(`Starting test for public and private transfer`);

      const balance = await ctx.feeJuiceToken.read.balanceOf([ctx.feeJuicePortal.address]);
      ctx.logger.info(`Balance of fee juice token: ${balance}`);

      expect(balance).toBeGreaterThan(0n);

      const canonicalAddress = await ctx.feeJuicePortal.read.ROLLUP();
      ctx.logger.info(`Canonical address: ${canonicalAddress}`);
      expect(canonicalAddress.toLowerCase()).toBe(
        ctx.t.l1Contracts.l1ContractAddresses.rollupAddress.toString().toLowerCase(),
      );

      // Create the two transactions
      const privateBalance = await ctx.provenAssets[0].methods.balance_of_private(sender).simulate({ from: sender });
      const privateSendAmount = privateBalance / 10n;
      expect(privateSendAmount).toBeGreaterThan(0n);
      const privateInteraction = ctx.provenAssets[0].methods.transfer(recipient, privateSendAmount);

      const publicBalance = await ctx.provenAssets[1].methods.balance_of_public(sender).simulate({ from: sender });
      const publicSendAmount = publicBalance / 10n;
      expect(publicSendAmount).toBeGreaterThan(0n);
      const publicInteraction = ctx.provenAssets[1].methods.transfer_in_public(sender, recipient, publicSendAmount, 0);

      // Prove them
      ctx.logger.info(`Proving txs`);
      const [publicProvenTx, privateProvenTx] = await Promise.all([
        publicInteraction.prove({ from: sender }),
        privateInteraction.prove({ from: sender }),
      ]);

      // Verify them
      ctx.logger.info(`Verifying txs`);
      await expect(ctx.t.circuitProofVerifier?.verifyProof(publicProvenTx)).resolves.not.toThrow();
      await expect(ctx.t.circuitProofVerifier?.verifyProof(privateProvenTx)).resolves.not.toThrow();

      // Sends the txs to node and awaits them to be mined separately, so they land on different blocks,
      // and we have more than one block in the epoch we end up proving
      ctx.logger.info(`Sending private tx`);
      const txPrivate = privateProvenTx.send();
      await txPrivate.wait({ timeout: 300, interval: 10 });

      ctx.logger.info(`Sending public tx`);
      const txPublic = publicProvenTx.send();
      await txPublic.wait({ timeout: 300, interval: 10 });

      ctx.logger.info(`Both txs have been mined`);
      const txs = [txPrivate, txPublic];

      // Flag the transfers on the token simulator
      ctx.tokenSim.transferPrivate(sender, recipient, privateSendAmount);
      ctx.tokenSim.transferPublic(sender, recipient, publicSendAmount);

      // Warp to the next epoch
      const epoch = await ctx.cheatCodes.rollup.getEpoch();
      ctx.logger.info(`Advancing from epoch ${epoch} to next epoch`);
      await ctx.cheatCodes.rollup.advanceToNextEpoch();

      const rewardsBeforeCoinbase = await ctx.rollup.getSequencerRewards(COINBASE_ADDRESS);
      const rewardsBeforeProver = await ctx.rollup.getSpecificProverRewardsForEpoch(epoch, ctx.t.proverAddress);
      const oldProvenBlockNumber = await ctx.rollup.getProvenBlockNumber();

      // And wait for the first pair of txs to be proven
      ctx.logger.info(`Awaiting proof for the previous epoch`);
      await Promise.all(
        txs.map(async tx => {
          const receipt = await tx.wait({ timeout: 300, interval: 10 });
          await waitForProven(ctx.t.aztecNode, receipt, { provenTimeout: 3000 });
        }),
      );

      const newProvenBlockNumber = await ctx.rollup.getProvenBlockNumber();
      expect(newProvenBlockNumber).toBeGreaterThan(oldProvenBlockNumber);
      expect(await ctx.rollup.getBlockNumber()).toBe(newProvenBlockNumber);

      ctx.logger.info(`checking rewards for coinbase: ${COINBASE_ADDRESS.toString()}`);
      const rewardsAfterCoinbase = await ctx.rollup.getSequencerRewards(COINBASE_ADDRESS);
      expect(rewardsAfterCoinbase).toBeGreaterThan(rewardsBeforeCoinbase);

      const rewardsAfterProver = await ctx.rollup.getSpecificProverRewardsForEpoch(epoch, ctx.t.proverAddress);
      expect(rewardsAfterProver).toBeGreaterThan(rewardsBeforeProver);

      const blockReward = await ctx.rollup.getBlockReward();
      const fees = (
        await Promise.all([
          ctx.t.aztecNode.getBlock(Number(newProvenBlockNumber - 1n)),
          ctx.t.aztecNode.getBlock(Number(newProvenBlockNumber)),
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
