/* eslint-disable no-console */
// TODO(#11825) finalise (probably once we have nightly tests setup for GKE) & enable in bootstrap.sh
import {
  type PXE,
  ProvenTx,
  SentTx,
  SponsoredFeePaymentMethod,
  Tx,
  readFieldCompressedString,
  sleep,
} from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import {
  type TestWallets,
  deploySponsoredTestWallets,
  setupTestWalletsWithTokens,
  startCompatiblePXE,
} from './setup_test_wallets.js';
import { isK8sConfig, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

describe('token transfer test', () => {
  jest.setTimeout(10 * 60 * 2000); // 20 minutes

  const logger = createLogger(`e2e:spartan-test:transfer`);
  const MINT_AMOUNT = 1000n;

  const ROUNDS = 1n;

  let testWallets: TestWallets;
  const forwardProcesses: ChildProcess[] = [];
  let pxe: PXE;
  let cleanup: undefined | (() => Promise<void>);

  afterAll(async () => {
    await cleanup?.();
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    if (isK8sConfig(config)) {
      const { process: sequencerProcess, port: sequencerPort } = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-validator`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_SEQUENCER_PORT,
      });
      forwardProcesses.push(sequencerProcess);
      const NODE_URL = `http://127.0.0.1:${sequencerPort}`;

      ({ pxe, cleanup } = await startCompatiblePXE(NODE_URL, ['1', 'true'].includes(config.AZTEC_REAL_PROOFS), logger));
      testWallets = await deploySponsoredTestWallets(pxe, MINT_AMOUNT, logger);
    } else {
      const PXE_URL = config.PXE_URL;
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
      .prove({
        fee: { paymentMethod: new SponsoredFeePaymentMethod(await getSponsoredFPCAddress()) },
      });

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

    const sentTxs: SentTx[] = [];

    // dump all txs at requested TPS
    const TPS = 1;
    logger.info(`Sending ${txs.length} txs at a rate of ${TPS} tx/s`);
    while (txs.length > 0) {
      const start = performance.now();

      const chunk = txs.splice(0, TPS);
      sentTxs.push(...chunk.map(tx => tx.send()));
      logger.info(`Sent txs: [${await Promise.all(chunk.map(tx => tx.getTxHash()))}]`);

      const end = performance.now();
      const delta = end - start;
      if (1000 - delta > 0) {
        await sleep(1000 - delta);
      }
    }

    await Promise.all(
      sentTxs.map(async sentTx => {
        await sentTx.wait({ timeout: 600 });
        const receipt = await sentTx.getReceipt();
        logger.info(`tx ${receipt.txHash} included in block: ${receipt.blockNumber}`);
      }),
    );

    const recipientBalance = await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate();
    logger.info(`recipientBalance: ${recipientBalance}`);
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
