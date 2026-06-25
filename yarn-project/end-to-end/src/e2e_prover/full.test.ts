import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { EthAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, NO_WAIT, waitForProven } from '@aztec/aztec.js/contracts';
import { waitForTx } from '@aztec/aztec.js/node';
import { Tx, TxExecutionResult } from '@aztec/aztec.js/tx';
import { RollupContract } from '@aztec/ethereum/contracts';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { parseBooleanEnv } from '@aztec/foundation/config';
import { getTestData, isGenerateTestDataEnabled } from '@aztec/foundation/testing';
import { updateProtocolCircuitSampleInputs } from '@aztec/foundation/testing/files';
import { FeeJuicePortalAbi, TestERC20Abi } from '@aztec/l1-artifacts';
import { ChildContract } from '@aztec/noir-test-contracts.js/Child';
import { ParentContract } from '@aztec/noir-test-contracts.js/Parent';
import { Gas } from '@aztec/stdlib/gas';
import { PrivateKernelTailCircuitPublicInputs } from '@aztec/stdlib/kernel';
import { ChonkProof } from '@aztec/stdlib/proofs';
import type { CircuitName } from '@aztec/stdlib/stats';
import { TX_ERROR_INVALID_PROOF } from '@aztec/stdlib/tx';

import TOML from '@iarna/toml';
import { jest } from '@jest/globals';
import { type GetContractReturnType, getContract } from 'viem';

import { FullProverTest } from '../fixtures/e2e_prover_test.js';
import { PIPELINING_SETUP_OPTS } from '../fixtures/fixtures.js';
import { ProvenTx, proveInteraction } from '../test-wallet/utils.js';

const REAL_PROOFS = !parseBooleanEnv(process.env.FAKE_PROOFS);

// Real proving can take 10+ min per epoch; under pipelined 12s slots a multi-epoch test
// can exceed 30 min. Keep 15 min for fake proofs, 45 min for real.
const TIMEOUT = REAL_PROOFS ? 45 * 60 * 1000 : 15 * 60 * 1000;

// Apply the same budget to module-level hooks (beforeAll/afterAll/afterEach) so the
// pipelined setup chain (account deploys + token deploy + mint + epoch advance +
// prover-node startup) doesn't time out.
jest.setTimeout(TIMEOUT);

// End-to-end proof pipeline: client proves transactions, submits to node, sequencer builds blocks,
// prover node generates epoch proofs, and L1 verifies them. FullProverTest uses real BB proofs when
// FAKE_PROOFS=0 (CI_FULL only); fake proofs otherwise. Setup: PIPELINING_SETUP_OPTS (ethSlot=4s,
// aztecSlot=12s). Timeout is 45 min real / 15 min fake. Time-warp: cheatCodes.rollup.advanceToNextEpoch.
// jest.setTimeout(TIMEOUT) is 45 min for real proofs, 15 min for fake proofs.
describe('full_prover', () => {
  const COINBASE_ADDRESS = EthAddress.random();
  const t = new FullProverTest('full_prover', 1, COINBASE_ADDRESS, REAL_PROOFS);

  let { provenAsset, accounts, tokenSim, logger, cheatCodes, provenWallet, aztecNode } = t;
  let sender: AztecAddress;
  let recipient: AztecAddress;

  let rollup: RollupContract;
  let feeJuiceToken: GetContractReturnType<typeof TestERC20Abi, ExtendedViemWalletClient>;
  let feeJuicePortal: GetContractReturnType<typeof FeeJuicePortalAbi, ExtendedViemWalletClient>;

  beforeAll(async () => {
    t.logger.warn(`Running suite with ${REAL_PROOFS ? 'real' : 'fake'} proofs`);

    await t.setup({ ...PIPELINING_SETUP_OPTS });

    ({ provenAsset, accounts, tokenSim, logger, cheatCodes, provenWallet, aztecNode } = t);
    [sender, recipient] = accounts;

    rollup = new RollupContract(t.l1Contracts.l1Client, t.l1Contracts.l1ContractAddresses.rollupAddress);

    feeJuicePortal = getContract({
      abi: FeeJuicePortalAbi,
      address: t.l1Contracts.l1ContractAddresses.feeJuicePortalAddress.toString(),
      client: t.l1Contracts.l1Client,
    });

    feeJuiceToken = getContract({
      abi: TestERC20Abi,
      address: t.l1Contracts.l1ContractAddresses.feeJuiceAddress.toString(),
      client: t.l1Contracts.l1Client,
    });
  }, TIMEOUT);

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

      const balance = await feeJuiceToken.read.balanceOf([feeJuicePortal.address]);
      logger.info(`Balance of fee juice token: ${balance}`);

      expect(balance).toBeGreaterThan(0n);

      const canonicalAddress = await feeJuicePortal.read.ROLLUP();
      logger.info(`Canonical address: ${canonicalAddress}`);
      expect(canonicalAddress.toLowerCase()).toBe(
        t.l1Contracts.l1ContractAddresses.rollupAddress.toString().toLowerCase(),
      );

      // Create the two transactions
      const { result: privateBalance } = await provenAsset.methods
        .balance_of_private(sender)
        .simulate({ from: sender });
      const privateSendAmount = privateBalance / 10n;
      expect(privateSendAmount).toBeGreaterThan(0n);
      const privateInteraction = provenAsset.methods.transfer(recipient, privateSendAmount);

      const { result: publicBalance } = await provenAsset.methods.balance_of_public(sender).simulate({ from: sender });
      const publicSendAmount = publicBalance / 10n;
      expect(publicSendAmount).toBeGreaterThan(0n);
      const publicInteraction = provenAsset.methods.transfer_in_public(sender, recipient, publicSendAmount, 0);

      // Prove them
      logger.info(`Proving txs`);
      const [publicProvenTx, privateProvenTx] = await Promise.all([
        proveInteraction(provenWallet, publicInteraction, { from: sender }),
        proveInteraction(provenWallet, privateInteraction, { from: sender }),
      ]);

      // Verify them
      logger.info(`Verifying txs`);
      await expect(t.circuitProofVerifier?.verifyProof(publicProvenTx)).resolves.not.toThrow();
      await expect(t.circuitProofVerifier?.verifyProof(privateProvenTx)).resolves.not.toThrow();

      // Sends the txs to node and awaits them to be mined separately, so they land on different blocks,
      // and we have more than one block in the epoch we end up proving
      logger.info(`Sending private tx`);
      const txPrivateReceipt = await privateProvenTx.send({ wait: { timeout: 300, interval: 10 } });

      logger.info(`Sending public tx`);
      const txPublicReceipt = await publicProvenTx.send({ wait: { timeout: 300, interval: 10 } });

      logger.info(`Both txs have been mined`);
      const receipts = [txPrivateReceipt, txPublicReceipt];

      // Flag the transfers on the token simulator
      tokenSim.transferPrivate(sender, recipient, privateSendAmount);
      tokenSim.transferPublic(sender, recipient, publicSendAmount);

      // Warp to the next epoch
      const epoch = await cheatCodes.rollup.getEpoch();
      logger.info(`Advancing from epoch ${epoch} to next epoch`);
      await cheatCodes.rollup.advanceToNextEpoch();

      const rewardsBeforeCoinbase = await rollup.getSequencerRewards(COINBASE_ADDRESS);
      const rewardsBeforeProver = await rollup.getSpecificProverRewardsForEpoch(BigInt(epoch), t.proverAddress);
      const oldProvenCheckpointNumber = await rollup.getProvenCheckpointNumber();

      // And wait for the first pair of txs to be proven
      logger.info(`Awaiting proof for the previous epoch`);
      await Promise.all(
        receipts.map(async receipt => {
          await waitForProven(t.aztecNode, receipt, { provenTimeout: 3000 });
        }),
      );

      const newProvenCheckpointNumber = await rollup.getProvenCheckpointNumber();
      expect(newProvenCheckpointNumber).toBeGreaterThan(oldProvenCheckpointNumber);
      expect(await rollup.getCheckpointNumber()).toBe(newProvenCheckpointNumber);

      logger.info(`checking rewards for coinbase: ${COINBASE_ADDRESS.toString()}`);
      const rewardsAfterCoinbase = await rollup.getSequencerRewards(COINBASE_ADDRESS);
      expect(rewardsAfterCoinbase).toBeGreaterThan(rewardsBeforeCoinbase);

      const rewardsAfterProver = await rollup.getSpecificProverRewardsForEpoch(BigInt(epoch), t.proverAddress);
      expect(rewardsAfterProver).toBeGreaterThan(rewardsBeforeProver);

      const reward = await rollup.getCheckpointReward();

      // Get all checkpoints that were proven in this epoch
      const numCheckpointsProven = Number(newProvenCheckpointNumber) - Number(oldProvenCheckpointNumber);
      const publishedCheckpoints = await t.aztecNode.getCheckpoints(
        CheckpointNumber(Number(oldProvenCheckpointNumber) + 1),
        numCheckpointsProven,
        { includeBlocks: true },
      );

      // Extract all blocks from all proven checkpoints
      const allBlocks = publishedCheckpoints.flatMap(pc => pc.blocks!);
      const fees = allBlocks.map(b => b.header.totalFees.toBigInt());

      const totalRewards = fees.map(fee => fee + reward).reduce((acc, reward) => acc + reward, 0n);
      const sequencerGain = rewardsAfterCoinbase - rewardsBeforeCoinbase;
      const proverGain = rewardsAfterProver - rewardsBeforeProver;

      // May be less than totalRewards due to burn.
      expect(sequencerGain + proverGain).toBeLessThanOrEqual(totalRewards);
    },
    TIMEOUT,
  );

  it('generates sample Prover.toml files if generate test data is on', async () => {
    if (!isGenerateTestDataEnabled() || REAL_PROOFS) {
      return;
    }
    // Deploy Parent + Child and prove three private chains to regenerate
    // `private-kernel-inner{,-2,-3}/Prover.toml`. The Token transfers below pack into init_2 /
    // init_3 and never invoke plain `inner` / `inner_2` / `inner_3`. The planner is N=3 greedy,
    // so we exercise it with three transactions:
    //   - 4 apps (entrypoint → parent.private_nested_static_call → parent.private_call →
    //     child.private_get_value) → init_3 + inner
    //   - 5 apps (BatchCall: nested chain + one extra leaf call) → init_3 + inner_2
    //   - 6 apps (BatchCall: nested chain + two extra leaf calls) → init_3 + inner_3
    // `proveInteraction` alone is enough to capture `pushTestData('private-kernel-inner{,-2,-3}',
    // ...)`; no need to land the txs.
    logger.info(`Deploying Parent + Child contracts to exercise inner kernels`);
    const { contract: childContract } = await ChildContract.deploy(provenWallet).send({ from: sender });
    const { contract: parentContract } = await ParentContract.deploy(provenWallet).send({ from: sender });
    // Seed a note in child so the static private_get_value reads below have something to return.
    await childContract.methods.private_set_value(42n, sender).send({ from: sender });
    const getValueSelector = await childContract.methods.private_get_value.selector();
    const nestedChain = () =>
      parentContract.methods.private_nested_static_call(childContract.address, getValueSelector, [42n, sender]);
    const extraLeaf = () => childContract.methods.private_get_value(42n, sender);
    logger.info(`Proving 4-app nested-call tx to populate private-kernel-inner test data`);
    await proveInteraction(provenWallet, nestedChain(), { from: sender });
    logger.info(`Proving 5-app batched tx to populate private-kernel-inner-2 test data`);
    await proveInteraction(provenWallet, new BatchCall(provenWallet, [nestedChain(), extraLeaf()]), { from: sender });
    logger.info(`Proving 6-app batched tx to populate private-kernel-inner-3 test data`);
    await proveInteraction(provenWallet, new BatchCall(provenWallet, [nestedChain(), extraLeaf(), extraLeaf()]), {
      from: sender,
    });

    // Create the two transactions
    const { result: privateBalance } = await provenAsset.methods.balance_of_private(sender).simulate({ from: sender });
    const privateSendAmount = privateBalance / 20n;
    expect(privateSendAmount).toBeGreaterThan(0n);
    const firstPrivateInteraction = provenAsset.methods.transfer(recipient, privateSendAmount);

    const { result: publicBalance } = await provenAsset.methods.balance_of_public(sender).simulate({ from: sender });
    const publicSendAmount = publicBalance / 10n;
    expect(publicSendAmount).toBeGreaterThan(0n);
    const publicInteraction = provenAsset.methods.transfer_in_public(sender, recipient, publicSendAmount, 0);

    // Prove them
    logger.info(`Proving txs`);
    const [publicProvenTx, firstPrivateProvenTx] = await Promise.all([
      proveInteraction(provenWallet, publicInteraction, { from: sender }),
      proveInteraction(provenWallet, firstPrivateInteraction, { from: sender }),
    ]);

    // Sends the txs to node and awaits them to be mined separately, so they land on different blocks,
    // and we have more than one block in the epoch we end up proving
    logger.info(`Sending private txs`);
    // First block, one private tx
    const firstTxPrivateReceipt = await firstPrivateProvenTx.send({ wait: { timeout: 300, interval: 10 } });

    // Create and send a set of 3 txs for the second block,
    // so we end up with three blocks and have merge and block-merge circuits
    const secondBlockInteractions = [
      provenAsset.methods.transfer(recipient, privateSendAmount),
      provenAsset.methods.set_admin(sender),
      provenAsset.methods.transfer_in_public(sender, recipient, publicSendAmount, 0),
    ];
    const secondBlockProvenTxs = await Promise.all(
      secondBlockInteractions.map(p => proveInteraction(provenWallet, p, { from: sender })),
    );
    const secondBlockReceipts = await Promise.all(
      secondBlockProvenTxs.map(p => p.send({ wait: { timeout: 300, interval: 10 } })),
    );

    logger.info(`Sending public tx`);
    // Third block, one public tx
    const txPublicReceipt = await publicProvenTx.send({ wait: { timeout: 300, interval: 10 } });

    logger.info(`All txs have been mined`);
    const receipts = [firstTxPrivateReceipt, ...secondBlockReceipts, txPublicReceipt];

    // Flag the transfers on the token simulator
    tokenSim.transferPrivate(sender, recipient, privateSendAmount);
    tokenSim.transferPrivate(sender, recipient, privateSendAmount);
    tokenSim.transferPublic(sender, recipient, publicSendAmount);
    tokenSim.transferPublic(sender, recipient, publicSendAmount);

    // Warp to the next epoch
    const epoch = await cheatCodes.rollup.getEpoch();
    logger.info(`Advancing from epoch ${epoch} to next epoch`);
    await cheatCodes.rollup.advanceToNextEpoch();

    // And wait for the first pair of txs to be proven
    logger.info(`Awaiting proof for the previous epoch`);
    await Promise.all(
      receipts.map(async receipt => {
        await waitForProven(t.aztecNode, receipt, { provenTimeout: 1500 });
      }),
    );

    // For the commented out circuits, run the tests in orchestrator_single_checkpoint.test.ts to generate the sample inputs.
    (
      [
        'private-kernel-init',
        'private-kernel-init-2',
        'private-kernel-init-3',
        'private-kernel-inner',
        'private-kernel-inner-2',
        'private-kernel-inner-3',
        'private-kernel-reset',
        'private-kernel-reset-tail',
        'private-kernel-reset-tail-to-public',
        'rollup-tx-base-private',
        'rollup-tx-base-public',
        // 'rollup-tx-merge',
        'rollup-block-root-first',
        'rollup-block-root-first-single-tx',
        // 'rollup-block-root-first-empty-tx',
        // 'rollup-block-root',
        // 'rollup-block-root-single-tx',
        // 'rollup-block-merge',
        // 'rollup-checkpoint-root',
        'rollup-checkpoint-root-single-block',
        'rollup-checkpoint-merge',
        'rollup-root',
      ] satisfies CircuitName[]
    ).forEach(circuitName => {
      const data = getTestData(circuitName);
      if (!data) {
        logger.warn(`No test data found for ${circuitName}.`);
      } else {
        updateProtocolCircuitSampleInputs(circuitName, TOML.stringify(data[0] as any));
      }
    });
  });

  it('rejects txs with invalid proofs', async () => {
    if (!REAL_PROOFS) {
      t.logger.warn(`Skipping test with fake proofs`);
      return;
    }

    const privateInteraction = t.fakeProofsAsset.methods.transfer(recipient, 1n);
    const publicInteraction = t.fakeProofsAsset.methods.transfer_in_public(sender, recipient, 1n, 0);

    const results = await Promise.allSettled([
      privateInteraction.send({ from: sender, wait: { timeout: 10, interval: 0.1 } }),
      publicInteraction.send({ from: sender, wait: { timeout: 10, interval: 0.1 } }),
    ]);

    expect(String((results[0] as PromiseRejectedResult).reason)).toMatch(TX_ERROR_INVALID_PROOF);
    expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(TX_ERROR_INVALID_PROOF);
  });

  it(
    'should prevent large influxes of txs with invalid proofs from causing ddos attacks',
    async () => {
      if (!REAL_PROOFS) {
        t.logger.warn(`Skipping test with fake proofs`);
        return;
      }

      const NUM_INVALID_TXS = 20;

      // Create and prove a tx
      logger.info(`Creating and proving tx`);
      const sendAmount = 1n;
      const interaction = provenAsset.methods.transfer(recipient, sendAmount);
      const provenTx = await proveInteraction(provenWallet, interaction, { from: sender });

      // Verify the tx proof
      logger.info(`Verifying the valid tx proof`);
      const verificationResult = await t.circuitProofVerifier?.verifyProof(provenTx);
      expect(verificationResult?.valid).toBeTrue();

      // Spam node with invalid txs
      logger.info(`Submitting ${NUM_INVALID_TXS} invalid transactions to simulate a ddos attack`);
      const data = provenTx.data;

      const txTasks = Array.from({ length: NUM_INVALID_TXS }, (_, i) => async () => {
        // Use a random ChonkProof and alter the public tx data to generate a unique invalid tx hash
        const invalidProvenTx = new ProvenTx(
          aztecNode,
          await Tx.create({
            data: new PrivateKernelTailCircuitPublicInputs(
              data.constants,
              data.gasUsed.add(new Gas(i + 1, 0)),
              data.feePayer,
              data.expirationTimestamp,
              data.forPublic,
              data.forRollup,
            ),
            chonkProof: ChonkProof.random(),
            contractClassLogFields: provenTx.contractClassLogFields,
            publicFunctionCalldata: provenTx.publicFunctionCalldata,
          }),
          [],
        );
        return invalidProvenTx.send({ wait: NO_WAIT });
      }).concat([() => provenTx.send({ wait: NO_WAIT })]); // Add the valid tx at the end

      const txPromises = Promise.allSettled(txTasks.map(task => task()));

      // Flag the valid transfer on the token simulator
      tokenSim.transferPrivate(sender, recipient, sendAmount);

      // Warp to the next epoch
      const epoch = await cheatCodes.rollup.getEpoch();
      logger.info(`Advancing from epoch ${epoch} to next epoch`);
      await cheatCodes.rollup.advanceToNextEpoch();

      const results = await txPromises;

      const validTxHash = provenTx.getTxHash();
      await waitForTx(aztecNode, validTxHash, { timeout: 300, interval: 10 });

      // Assert that the large influx of invalid txs are rejected and do not ddos the node
      for (let i = 0; i < NUM_INVALID_TXS; i++) {
        expect(String((results[i] as PromiseRejectedResult).reason)).toMatch(TX_ERROR_INVALID_PROOF);
      }

      // Assert that the valid tx is successfully sent and mined
      const validTxReceipt = await aztecNode.getTxReceipt(validTxHash);
      expect(validTxReceipt.executionResult).toBe(TxExecutionResult.SUCCESS);

      logger.info(`Valid tx was mined and invalid txs were dropped by P2P node`);
    },
    TIMEOUT,
  );
});
