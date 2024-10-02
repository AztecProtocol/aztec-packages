import { type AztecAddress, retryUntil } from '@aztec/aztec.js';

import '@jest/globals';

import { FullProverTest } from './e2e_prover_test.js';

const TIMEOUT = 1_800_000;

// This makes AVM proving throw if there's a failure.
process.env.AVM_PROVING_STRICT = '1';

describe('full_prover', () => {
  const realProofs = !['true', '1'].includes(process.env.FAKE_PROOFS ?? '');
  const t = new FullProverTest('full_prover', 1, realProofs);

  let { provenAssets, accounts, tokenSim, logger, cheatCodes } = t;
  let sender: AztecAddress;
  let recipient: AztecAddress;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    await t.deployVerifier();

    ({ provenAssets, accounts, tokenSim, logger, cheatCodes } = t);
    [sender, recipient] = accounts.map(a => a.address);
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
      const [publicTx, privateTx] = await Promise.all([publicInteraction.prove(), privateInteraction.prove()]);

      // Verify them
      logger.info(`Verifying txs`);
      await expect(t.circuitProofVerifier?.verifyProof(publicTx)).resolves.not.toThrow();
      await expect(t.circuitProofVerifier?.verifyProof(privateTx)).resolves.not.toThrow();

      // Sends the txs to node and awaits them to be mined
      logger.info(`Sending txs`);
      const sendOpts = { skipPublicSimulation: true };
      const txs = [privateInteraction.send(sendOpts), publicInteraction.send(sendOpts)];
      logger.info(`Awaiting txs to be mined`);
      await Promise.all(txs.map(tx => tx.wait({ timeout: 300, interval: 10, proven: false })));

      // Flag the transfers on the token simulator
      tokenSim.transferPrivate(sender, recipient, privateSendAmount);
      tokenSim.transferPublic(sender, recipient, publicSendAmount);

      // Warp to the next epoch
      const epoch = await cheatCodes.rollup.getEpoch();
      logger.info(`Advancing from epoch ${epoch} to next epoch`);
      await cheatCodes.rollup.advanceToNextEpoch();

      // Wait until the prover node submits a quote
      logger.info(`Waiting for prover node to submit quote for epoch ${epoch}`);
      await retryUntil(() => t.aztecNode.getEpochProofQuotes(epoch).then(qs => qs.length > 0), 'quote', 60, 1);

      // Send another tx so the sequencer can assemble a block that includes the prover node claim
      // so the prover node starts proving
      logger.info(`Sending tx to trigger a new block that includes the quote from the prover node`);
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
