import { type Tx } from '@aztec/aztec.js';
import { type BBNativeProofCreator } from '@aztec/bb-prover';
import { type ClientProtocolArtifact } from '@aztec/noir-protocol-circuits-types';

import { FullProverTest } from './e2e_prover_test.js';

const TIMEOUT = 2_400_000;

async function verifyProof(circuitType: ClientProtocolArtifact, tx: Tx, proofCreator: BBNativeProofCreator) {
  await expect(proofCreator.verifyProofForProtocolCircuit(circuitType, tx.proof)).resolves.not.toThrow();
}

describe('full_prover', () => {
  const t = new FullProverTest('full_prover');
  let { provenAsset, accounts, tokenSim, logger, proofCreator } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    ({ provenAsset, accounts, tokenSim, logger, proofCreator } = t);
  });

  afterAll(async () => {
    await t.teardown();
  });

  afterEach(async () => {
    await t.tokenSim.check();
  });

  it(
    'transfer less than balance',
    async () => {
      logger.info(
        `Starting test using function: ${provenAsset.address}:${provenAsset.methods.balance_of_private.selector}`,
      );
      const privateBalance = await provenAsset.methods.balance_of_private(accounts[0].address).simulate();
      const privateSendAmount = privateBalance / 2n;
      expect(privateSendAmount).toBeGreaterThan(0n);
      const privateInteraction = provenAsset.methods.transfer(
        accounts[0].address,
        accounts[1].address,
        privateSendAmount,
        0,
      );
      const privateTx = await privateInteraction.prove();

      // This will recursively verify all app and kernel circuits involved in the private stage of this transaction!
      logger.info(`Verifying private kernel tail proof`);
      await verifyProof('PrivateKernelTailArtifact', privateTx, proofCreator!);

      // const publicBalance = await provenAsset.methods.balance_of_public(accounts[0].address).simulate();
      // const publicSendAmount = publicBalance / 2n;
      // expect(publicSendAmount).toBeGreaterThan(0n);
      // const publicInteraction = provenAsset.methods.transfer_public(
      //   accounts[0].address,
      //   accounts[1].address,
      //   publicSendAmount,
      //   0,
      // );
      //const publicTx = await publicInteraction.prove();

      // This will recursively verify all app and kernel circuits involved in the private stage of this transaction!
      //logger.info(`Verifying kernel tail to public proof`);
      //await verifyProof('PrivateKernelTailToPublicArtifact', publicTx, proofCreator!);

      const sentPrivateTx = privateInteraction.send();
      //const sentPublicTx = publicInteraction.send();
      await Promise.all([
        sentPrivateTx.wait({ timeout: 600, interval: 10 }),
        //sentPublicTx.wait({ timeout: 600, interval: 10 }),
      ]);
      tokenSim.transferPrivate(accounts[0].address, accounts[1].address, privateSendAmount);
      //tokenSim.transferPublic(accounts[0].address, accounts[1].address, publicSendAmount);
    },
    TIMEOUT,
  );
});
