/* eslint-disable no-console */
// TODO(#11825) finalise (probably once we have nightly tests setup for GKE) & enable in bootstrap.sh
import { ProvenTx, Tx, readFieldCompressedString } from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { type TestWallets, deployTestWalletWithTokens, setupTestWalletsWithTokens } from './setup_test_wallets.js';
import { isK8sConfig, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

describe('token transfer test', () => {
  jest.setTimeout(10 * 60 * 2000); // 20 minutes

  const logger = createLogger(`e2e:spartan-test:transfer`);
  const MINT_AMOUNT = 1000n;

  const ROUNDS = 1n;

  let testWallets: TestWallets;
  let PXE_URL: string;
  let ETHEREUM_HOSTS: string[];
  const forwardProcesses: ChildProcess[] = [];

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    if (isK8sConfig(config)) {
      const { process: pxeProcess, port: pxePort } = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_PXE_PORT,
      });
      forwardProcesses.push(pxeProcess);
      PXE_URL = `http://127.0.0.1:${pxePort}`;

      const { process: ethProcess, port: ethPort } = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-eth-execution`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_ETHEREUM_PORT,
      });
      forwardProcesses.push(ethProcess);
      ETHEREUM_HOSTS = [`http://127.0.0.1:${ethPort}`];

      const { process: sequencerProcess, port: sequencerPort } = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-validator`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_SEQUENCER_PORT,
      });
      forwardProcesses.push(sequencerProcess);
      const NODE_URL = `http://127.0.0.1:${sequencerPort}`;

      const L1_ACCOUNT_MNEMONIC = config.L1_ACCOUNT_MNEMONIC;

      console.log('deploying test wallets');

      testWallets = await deployTestWalletWithTokens(
        PXE_URL,
        NODE_URL,
        ETHEREUM_HOSTS,
        L1_ACCOUNT_MNEMONIC,
        MINT_AMOUNT,
        logger,
      );
      console.log(`testWallets ready 1`);
    } else {
      PXE_URL = config.PXE_URL;
      testWallets = await setupTestWalletsWithTokens(PXE_URL, MINT_AMOUNT, logger);
    }
    expect(ROUNDS).toBeLessThanOrEqual(MINT_AMOUNT);
  });

  it('can get info', async () => {
    const name = readFieldCompressedString(await testWallets.tokenAdminWallet.methods.private_get_name().simulate());
    expect(name).toBe(testWallets.tokenName);
  });

  it('can transfer 1 token privately and publicly', async () => {
    const recipient = testWallets.recipientWallet.getAddress();
    const transferAmount = 1n;

    for (const w of testWallets.wallets) {
      expect(MINT_AMOUNT).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate());
    }

    expect(0n).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate());

    // For each round, make both private and public transfers
    // for (let i = 1n; i <= ROUNDS; i++) {
    //   const interactions = await Promise.all([
    //     ...testWallets.wallets.map(async w =>
    //       (
    //         await TokenContract.at(testWallets.tokenAddress, w)
    //       ).methods.transfer_in_public(w.getAddress(), recipient, transferAmount, 0),
    //     ),
    //   ]);

    //   const txs = await Promise.all(interactions.map(async i => await i.prove()));

    //   await Promise.all(txs.map(t => t.send().wait({ timeout: 600 })));
    // }

    const wallet = testWallets.wallets[0];

    const baseTx = await (await TokenContract.at(testWallets.tokenAddress, wallet)).methods
      .transfer_in_public(wallet.getAddress(), recipient, transferAmount, 0)
      .prove();

    const txs: ProvenTx[] = [];
    for (let i = 0; i < 20; i++) {
      const clonedTxData = Tx.clone(baseTx);

      // Modify the first nullifier to make it unique
      const nullifiers = clonedTxData.data.getNonEmptyNullifiers();
      if (nullifiers.length > 0) {
        // Create a new nullifier by adding the index to the original
        const newNullifier = nullifiers[0].add(Fr.fromString(i.toString()));
        // Replace the first nullifier with our new unique one
        if (clonedTxData.data.forRollup) {
          clonedTxData.data.forRollup.end.nullifiers[0] = newNullifier;
        } else if (clonedTxData.data.forPublic) {
          clonedTxData.data.forPublic.nonRevertibleAccumulatedData.nullifiers[0] = newNullifier;
        }
      }

      const clonedTx = new ProvenTx(wallet, clonedTxData, []);
      txs.push(clonedTx);
    }
    await Promise.all(
      txs.map(async (tx, i) => {
        const sentTx = tx.send();
        console.log(`sent tx: #${i + 1}`);
        await sentTx.wait({ timeout: 600 });
        const receipt = await sentTx.getReceipt();
        console.log(`tx ${i + 1} included in block: ${receipt.blockNumber}`);
        return sentTx;
      }),
    );

    const recipientBalance = await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate();
    console.log(`recipientBalance: ${recipientBalance}`);
    // expect(recipientBalance).toBe(100n * transferAmount);

    // for (const w of testWallets.wallets) {
    //   expect(MINT_AMOUNT - ROUNDS * transferAmount).toBe(
    //     await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate(),
    //   );
    // }

    // expect(ROUNDS * transferAmount * BigInt(testWallets.wallets.length)).toBe(
    //   await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate(),
    // );
  });
});
