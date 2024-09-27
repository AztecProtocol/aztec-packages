import { FullProverTest } from './e2e_prover_test.js';

const TIMEOUT = 1_800_000;

// This makes AVM proving throw if there's a failure.
process.env.AVM_PROVING_STRICT = '1';

describe('full_prover', () => {
  const realProofs = !['true', '1'].includes(process.env.FAKE_PROOFS ?? '');
  const t = new FullProverTest('full_prover', 1, realProofs);
  let { provenAssets, accounts, tokenSim, logger } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    await t.deployVerifier();
    ({ provenAssets, accounts, tokenSim, logger } = t);
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
      logger.info(
        `Starting test using function: ${provenAssets[0].address}:${provenAssets[0].methods.balance_of_private.selector}`,
      );
      const privateBalance = await provenAssets[0].methods.balance_of_private(accounts[0].address).simulate();
      const privateSendAmount = privateBalance / 2n;
      expect(privateSendAmount).toBeGreaterThan(0n);
      const privateInteraction = provenAssets[0].methods.transfer(accounts[1].address, privateSendAmount);

      const publicBalance = await provenAssets[1].methods.balance_of_public(accounts[0].address).simulate();
      const publicSendAmount = publicBalance / 2n;
      expect(publicSendAmount).toBeGreaterThan(0n);
      const publicInteraction = provenAssets[1].methods.transfer_public(
        accounts[0].address,
        accounts[1].address,
        publicSendAmount,
        0,
      );
      const [publicTx, privateTx] = await Promise.all([publicInteraction.prove(), privateInteraction.prove()]);

      // This will recursively verify all app and kernel circuits involved in the private stage of this transaction!
      logger.info(`Verifying kernel tail to public proof`);
      await expect(t.circuitProofVerifier?.verifyProof(publicTx)).resolves.not.toThrow();

      // This will recursively verify all app and kernel circuits involved in the private stage of this transaction!
      logger.info(`Verifying private kernel tail proof`);
      await expect(t.circuitProofVerifier?.verifyProof(privateTx)).resolves.not.toThrow();

      // TODO(palla/prover): The following depends on the epoch boundaries to work. It assumes that we're proving
      // 2-block epochs, and a new epoch is starting now, so the 2nd tx will land on the last block of the epoch and
      // get proven. That relies on how many blocks we mined before getting here.
      // We can make this more robust when we add padding, set 1-block epochs, and rollback the test config to
      // have a min of 2 txs per block, so these both land on the same block.
      logger.info(`Sending first tx and awaiting it to be mined`);
      await privateInteraction.send({ skipPublicSimulation: true }).wait({ timeout: 300, interval: 10 });
      logger.info(`Sending second tx and awaiting it to be proven`);
      await publicInteraction
        .send({ skipPublicSimulation: true })
        .wait({ timeout: 300, interval: 10, proven: true, provenTimeout: 1500 });

      tokenSim.transferPrivate(accounts[0].address, accounts[1].address, privateSendAmount);
      tokenSim.transferPublic(accounts[0].address, accounts[1].address, publicSendAmount);
    },
    TIMEOUT,
  );

  it('rejects txs with invalid proofs', async () => {
    if (!realProofs) {
      t.logger.warn(`Skipping test with fake proofs`);
      return;
    }

    const privateInteraction = t.fakeProofsAsset.methods.transfer(accounts[1].address, 1);
    const publicInteraction = t.fakeProofsAsset.methods.transfer_public(accounts[0].address, accounts[1].address, 1, 0);

    const sentPrivateTx = privateInteraction.send();
    const sentPublicTx = publicInteraction.send();

    const results = await Promise.allSettled([
      sentPrivateTx.wait({ timeout: 10, interval: 0.1 }),
      sentPublicTx.wait({ timeout: 10, interval: 0.1 }),
    ]);

    expect(String((results[0] as PromiseRejectedResult).reason)).toMatch(/Tx dropped by P2P node/);
    expect(String((results[1] as PromiseRejectedResult).reason)).toMatch(/Tx dropped by P2P node/);
  });
});
