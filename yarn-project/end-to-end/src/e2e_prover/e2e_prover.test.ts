import { type Tx } from '@aztec/aztec.js';
import { type BBNativeProofCreator } from '@aztec/bb-prover';
import { type ClientProtocolArtifact } from '@aztec/noir-protocol-circuits-types';

import { FullProverTest } from './e2e_prover_test.js';

const TIMEOUT = 1_800_000;

async function verifyProof(circuitType: ClientProtocolArtifact, tx: Tx, proofCreator: BBNativeProofCreator) {
  await expect(proofCreator.verifyProofForProtocolCircuit(circuitType, tx.proof)).resolves.not.toThrow();
}

describe('full_prover', () => {
  const t = new FullProverTest('full_prover');
  let { provenAssets, accounts, tokenSim, logger, proofCreator } = t;

  beforeAll(async () => {
    await t.applyBaseSnapshots();
    await t.applyMintSnapshot();
    await t.setup();
    ({ provenAssets, accounts, tokenSim, logger, proofCreator } = t);
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
      const privateInteraction = provenAssets[0].methods.transfer(
        accounts[0].address,
        accounts[1].address,
        privateSendAmount,
        0,
      );

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
      await verifyProof('PrivateKernelTailToPublicArtifact', publicTx, proofCreator!);

      // This will recursively verify all app and kernel circuits involved in the private stage of this transaction!
      logger.info(`Verifying private kernel tail proof`);
      await verifyProof('PrivateKernelTailArtifact', privateTx, proofCreator!);

      const sentPrivateTx = privateInteraction.send();
      const sentPublicTx = publicInteraction.send();
      await Promise.all([
        sentPrivateTx.wait({ timeout: 1200, interval: 10 }),
        sentPublicTx.wait({ timeout: 1200, interval: 10 }),
      ]);
      tokenSim.transferPrivate(accounts[0].address, accounts[1].address, privateSendAmount);
      tokenSim.transferPublic(accounts[0].address, accounts[1].address, publicSendAmount);
    },
    TIMEOUT,
  );
});
