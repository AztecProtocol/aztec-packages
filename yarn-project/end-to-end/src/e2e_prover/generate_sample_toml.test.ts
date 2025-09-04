import { type AztecAddress, EthAddress, waitForProven } from '@aztec/aztec.js';
import { getTestData, isGenerateTestDataEnabled } from '@aztec/foundation/testing';
import { updateProtocolCircuitSampleInputs } from '@aztec/foundation/testing/files';

import TOML from '@iarna/toml';
import '@jest/globals';

import { type ProverTestContext, REAL_PROOFS, setupProverTestEnvironment } from './shared_prover_test_setup.js';

describe('prover_sample_toml_generation', () => {
  const COINBASE_ADDRESS = EthAddress.random();
  let ctx: ProverTestContext;

  let sender: AztecAddress;
  let recipient: AztecAddress;

  beforeAll(async () => {
    ctx = await setupProverTestEnvironment('prover_sample_toml', COINBASE_ADDRESS);
    sender = ctx.sender;
    recipient = ctx.recipient;
  }, 120_000);

  afterAll(async () => {
    await ctx.t.teardown();
  });

  afterEach(async () => {
    await ctx.tokenSim.check();
  });

  it('generates sample Prover.toml files if generate test data is on', async () => {
    if (!isGenerateTestDataEnabled() || REAL_PROOFS) {
      return;
    }
    // Create the two transactions
    const privateBalance = await ctx.provenAssets[0].methods.balance_of_private(sender).simulate({ from: sender });
    const privateSendAmount = privateBalance / 20n;
    expect(privateSendAmount).toBeGreaterThan(0n);
    const firstPrivateInteraction = ctx.provenAssets[0].methods.transfer(recipient, privateSendAmount);

    const publicBalance = await ctx.provenAssets[1].methods.balance_of_public(sender).simulate({ from: sender });
    const publicSendAmount = publicBalance / 10n;
    expect(publicSendAmount).toBeGreaterThan(0n);
    const publicInteraction = ctx.provenAssets[1].methods.transfer_in_public(sender, recipient, publicSendAmount, 0);

    // Prove them
    ctx.logger.info(`Proving txs`);
    const [publicProvenTx, firstPrivateProvenTx] = await Promise.all([
      publicInteraction.prove({ from: sender }),
      firstPrivateInteraction.prove({ from: sender }),
    ]);

    // Sends the txs to node and awaits them to be mined separately, so they land on different blocks,
    // and we have more than one block in the epoch we end up proving
    ctx.logger.info(`Sending private txs`);
    // First block, one private tx
    const firstTxPrivate = firstPrivateProvenTx.send();
    await firstTxPrivate.wait({ timeout: 300, interval: 10 });

    // Create and send a set of 3 txs for the second block,
    // so we end up with three blocks and have merge and block-merge circuits
    const secondBlockInteractions = [
      ctx.provenAssets[0].methods.transfer(recipient, privateSendAmount),
      ctx.provenAssets[0].methods.set_admin(sender),
      ctx.provenAssets[1].methods.transfer_in_public(sender, recipient, publicSendAmount, 0),
    ];
    const secondBlockProvenTxs = await Promise.all(secondBlockInteractions.map(p => p.prove({ from: sender })));
    const secondBlockTxs = await Promise.all(secondBlockProvenTxs.map(p => p.send()));
    await Promise.all(secondBlockTxs.map(t => t.wait({ timeout: 300, interval: 10 })));

    ctx.logger.info(`Sending public tx`);
    // Third block, one public tx
    const txPublic = publicProvenTx.send();
    await txPublic.wait({ timeout: 300, interval: 10 });

    ctx.logger.info(`All txs have been mined`);
    const txs = [firstTxPrivate, ...secondBlockTxs, txPublic];

    // Flag the transfers on the token simulator
    ctx.tokenSim.transferPrivate(sender, recipient, privateSendAmount);
    ctx.tokenSim.transferPrivate(sender, recipient, privateSendAmount);
    ctx.tokenSim.transferPublic(sender, recipient, publicSendAmount);
    ctx.tokenSim.transferPublic(sender, recipient, publicSendAmount);

    // Warp to the next epoch
    const epoch = await ctx.cheatCodes.rollup.getEpoch();
    ctx.logger.info(`Advancing from epoch ${epoch} to next epoch`);
    await ctx.cheatCodes.rollup.advanceToNextEpoch();

    // And wait for the first pair of txs to be proven
    ctx.logger.info(`Awaiting proof for the previous epoch`);
    await Promise.all(
      txs.map(async tx => {
        const receipt = await tx.wait({ timeout: 300, interval: 10 });
        await waitForProven(ctx.t.aztecNode, receipt, { provenTimeout: 1500 });
      }),
    );

    [
      'private-kernel-init',
      'private-kernel-inner',
      'private-kernel-tail',
      'private-kernel-tail-to-public',
      'private-kernel-reset',
      'rollup-base-private',
      'rollup-base-public',
      'rollup-merge',
      'rollup-block-root',
      'rollup-block-merge',
      'rollup-root',
    ].forEach(circuitName => {
      const data = getTestData(circuitName);
      if (data) {
        updateProtocolCircuitSampleInputs(circuitName, TOML.stringify(data[0] as any));
      }
    });
  });
});
