import { type AztecAddress, EthAddress, retryUntil } from '@aztec/aztec.js';
import { RollupAbi, SysstiaAbi, TestERC20Abi } from '@aztec/l1-artifacts';

import '@jest/globals';
import { type Chain, type GetContractReturnType, type HttpTransport, type PublicClient, getContract } from 'viem';

import { FullProverTest } from './e2e_prover_test.js';

const TIMEOUT = 1_800_000;

// This makes AVM proving throw if there's a failure.
process.env.AVM_PROVING_STRICT = '1';

describe('full_prover', () => {
  const realProofs = !['true', '1'].includes(process.env.FAKE_PROOFS ?? '');
  const COINBASE_ADDRESS = EthAddress.random();
  const t = new FullProverTest('full_prover', 1, COINBASE_ADDRESS, realProofs);

  let { provenAssets, accounts, tokenSim, logger, cheatCodes } = t;
  let sender: AztecAddress;
  let recipient: AztecAddress;

  let rollup: GetContractReturnType<typeof RollupAbi, PublicClient<HttpTransport, Chain>>;
  let feeJuice: GetContractReturnType<typeof TestERC20Abi, PublicClient<HttpTransport, Chain>>;
  let sysstia: GetContractReturnType<typeof SysstiaAbi, PublicClient<HttpTransport, Chain>>;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    await t.deployVerifier();

    ({ provenAssets, accounts, tokenSim, logger, cheatCodes } = t);
    [sender, recipient] = accounts.map(a => a.address);

    rollup = getContract({
      abi: RollupAbi,
      address: t.l1Contracts.l1ContractAddresses.rollupAddress.toString(),
      client: t.l1Contracts.publicClient,
    });

    feeJuice = getContract({
      abi: TestERC20Abi,
      address: t.l1Contracts.l1ContractAddresses.feeJuiceAddress.toString(),
      client: t.l1Contracts.publicClient,
    });

    sysstia = getContract({
      abi: SysstiaAbi,
      address: t.l1Contracts.l1ContractAddresses.sysstiaAddress.toString(),
      client: t.l1Contracts.publicClient,
    });
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it(
    'makes both public and private transfers',
    async () => {
      logger.info(`Starting test for public and private transfer`);

      // Create the two transactions
      const privateBalance = await provenAssets[0].methods.balance_of_private(sender).simulate();
      const privateSendAmount = privateBalance / 10n;
      expect(privateSendAmount).toBeGreaterThan(0n);
      const privateInteraction = provenAssets[0].methods.transfer(recipient, privateSendAmount);

      const publicBalance = await provenAssets[1].methods.balance_of_public(sender).simulate();
      const publicSendAmount = publicBalance / 10n;
      expect(publicSendAmount).toBeGreaterThan(0n);
      const publicInteraction = provenAssets[1].methods.transfer_public(sender, recipient, publicSendAmount, 0);

      // Prove them
      logger.info(`Proving txs`);
      const provingOpts = { skipPublicSimulation: true };
      const [publicProvenTx, privateProvenTx] = await Promise.all([
        publicInteraction.prove(provingOpts),
        privateInteraction.prove(provingOpts),
      ]);

      // Verify them
      logger.info(`Verifying txs`);
      await expect(t.circuitProofVerifier?.verifyProof(publicProvenTx)).resolves.not.toThrow();
      await expect(t.circuitProofVerifier?.verifyProof(privateProvenTx)).resolves.not.toThrow();

      // Sends the txs to node and awaits them to be mined separately, so they land on different blocks,
      // and we have more than one block in the epoch we end up proving
      logger.info(`Sending private tx`);
      const txPrivate = privateProvenTx.send();
      await txPrivate.wait({ timeout: 300, interval: 10, proven: false });

      logger.info(`Sending public tx`);
      const txPublic = publicProvenTx.send();
      await txPublic.wait({ timeout: 300, interval: 10, proven: false });

      logger.info(`Both txs have been mined`);
      const txs = [txPrivate, txPublic];

      // Flag the transfers on the token simulator
      tokenSim.transferPrivate(sender, recipient, privateSendAmount);
      tokenSim.transferPublic(sender, recipient, publicSendAmount);

      // Warp to the next epoch
      const epoch = await cheatCodes.rollup.getEpoch();
      logger.info(`Advancing from epoch ${epoch} to next epoch`);
      await cheatCodes.rollup.advanceToNextEpoch();

      const balanceBeforeCoinbase = await feeJuice.read.balanceOf([COINBASE_ADDRESS.toString()]);
      const balanceBeforeProver = await feeJuice.read.balanceOf([t.proverAddress.toString()]);

      // Wait until the prover node submits a quote
      logger.info(`Waiting for prover node to submit quote for epoch ${epoch}`);
      await retryUntil(() => t.aztecNode.getEpochProofQuotes(epoch).then(qs => qs.length > 0), 'quote', 60, 1);

      // Send another tx so the sequencer can assemble a block that includes the prover node claim
      // so the prover node starts proving
      logger.info(`Sending tx to trigger a new block that includes the quote from the prover node`);
      const sendOpts = { skipPublicSimulation: true };
      await provenAssets[0].methods
        .transfer(recipient, privateSendAmount)
        .send(sendOpts)
        .wait({ timeout: 300, interval: 10 });
      tokenSim.transferPrivate(sender, recipient, privateSendAmount);

      // Expect the block to have a claim
      const claim = await cheatCodes.rollup.getProofClaim();
      expect(claim).toBeDefined();
      expect(claim?.epochToProve).toEqual(epoch);

      // And wait for the first pair of txs to be proven
      logger.info(`Awaiting proof for the previous epoch`);
      await Promise.all(txs.map(tx => tx.wait({ timeout: 300, interval: 10, proven: true, provenTimeout: 1500 })));

      const provenBn = await rollup.read.getProvenBlockNumber();
      const balanceAfterCoinbase = await feeJuice.read.balanceOf([COINBASE_ADDRESS.toString()]);
      const balanceAfterProver = await feeJuice.read.balanceOf([t.proverAddress.toString()]);
      const blockReward = (await sysstia.read.BLOCK_REWARD()) as bigint;
      const fees = (
        await Promise.all([t.aztecNode.getBlock(Number(provenBn - 1n)), t.aztecNode.getBlock(Number(provenBn))])
      ).map(b => b!.header.totalFees.toBigInt());

      const rewards = fees.map(fee => fee + blockReward);
      const toProver = rewards
        .map(reward => (reward * claim!.basisPointFee) / 10_000n)
        .reduce((acc, fee) => acc + fee, 0n);
      const toCoinbase = rewards.reduce((acc, reward) => acc + reward, 0n) - toProver;

      expect(provenBn + 1n).toBe(await rollup.read.getPendingBlockNumber());
      expect(balanceAfterCoinbase).toBe(balanceBeforeCoinbase + toCoinbase);
      expect(balanceAfterProver).toBe(balanceBeforeProver + toProver);
      expect(claim!.bondProvider).toEqual(t.proverAddress);
    },
    TIMEOUT,
  );

  it('rejects txs with invalid proofs', async () => {
    if (!realProofs) {
      t.logger.warn(`Skipping test with fake proofs`);
      return;
    }

    const privateInteraction = t.fakeProofsAsset.methods.transfer(recipient, 1n);
    const publicInteraction = t.fakeProofsAsset.methods.transfer_public(sender, recipient, 1n, 0);

    const sentPrivateTx = privateInteraction.send({ skipPublicSimulation: true });
    const sentPublicTx = publicInteraction.send({ skipPublicSimulation: true });

    const results = await Promise.allSettled([
      sentPrivateTx.wait({ timeout: 10, interval: 0.1 }),
      sentPublicTx.wait({ timeout: 10, interval: 0.1 }),
    ]);

    expect(String((results[0] as PromiseRejectedResult).reason)).toMatch(/Tx dropped by P2P node/);
    expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(/Tx dropped by P2P node/);
  });
});
