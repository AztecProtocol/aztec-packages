// TODO(#11825) finalize (probably once we have nightly tests setup for GKE) & enable in bootstrap.sh
import { ProvenTx, SentTx, SponsoredFeePaymentMethod, Tx, readFieldCompressedString, sleep } from '@aztec/aztec.js';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import {
  type TestAccounts,
  createWalletAndAztecNodeClient,
  deploySponsoredTestAccounts,
} from './setup_test_wallets.js';
import { setupEnvironment, startPortForwardForRPC } from './utils.js';

const config = { ...setupEnvironment(process.env) };
describe('token transfer test', () => {
  jest.setTimeout(10 * 60 * 2000); // 20 minutes

  const logger = createLogger(`e2e:spartan-test:transfer`);
  const MINT_AMOUNT = 1000n;

  const ROUNDS = 1n;

  let testAccounts: TestAccounts;
  const forwardProcesses: ChildProcess[] = [];
  let cleanup: undefined | (() => Promise<void>);

  afterAll(async () => {
    await cleanup?.();
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    logger.info('Starting port forward for PXE');
    const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess);
    const rpcUrl = `http://127.0.0.1:${aztecRpcPort}`;

    const {
      wallet,
      aztecNode,
      cleanup: _cleanup,
    } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, logger);
    cleanup = _cleanup;

    // Setup wallets
    testAccounts = await deploySponsoredTestAccounts(wallet, aztecNode, MINT_AMOUNT, logger);

    expect(ROUNDS).toBeLessThanOrEqual(MINT_AMOUNT);
  });

  it('can get info', async () => {
    const name = readFieldCompressedString(
      await testAccounts.tokenContract.methods.private_get_name().simulate({ from: testAccounts.tokenAdminAddress }),
    );
    expect(name).toBe(testAccounts.tokenName);
  });

  it('can transfer 1 token privately and publicly', async () => {
    const recipient = testAccounts.recipientAddress;
    const transferAmount = 1n;

    for (const acc of testAccounts.accounts) {
      expect(MINT_AMOUNT).toBe(
        await testAccounts.tokenContract.methods
          .balance_of_public(acc)
          .simulate({ from: testAccounts.tokenAdminAddress }),
      );
    }

    expect(0n).toBe(
      await testAccounts.tokenContract.methods
        .balance_of_public(recipient)
        .simulate({ from: testAccounts.tokenAdminAddress }),
    );

    // For each round, make both private and public transfers
    // for (let i = 1n; i <= ROUNDS; i++) {
    //   const interactions = await Promise.all([
    //     ...testAccounts.wallets.map(async w =>
    //       (
    //         await TokenContract.at(testAccounts.tokenAddress, w)
    //       ).methods.transfer_in_public(w.getAddress(), recipient, transferAmount, 0),
    //     ),
    //   ]);

    //   const txs = await Promise.all(interactions.map(async i => await i.prove()));

    //   await Promise.all(txs.map(t => t.send().wait({ timeout: 600 })));
    // }

    const defaultAccountAddress = testAccounts.accounts[0];

    const baseTx = await testAccounts.tokenContract.methods
      .transfer_in_public(defaultAccountAddress, recipient, transferAmount, 0)
      .prove({
        from: testAccounts.tokenAdminAddress,
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

      const clonedTx = new ProvenTx(testAccounts.wallet, clonedTxData, []);
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
      logger.info(`Sent txs: [${(await Promise.all(chunk.map(tx => tx.getTxHash()))).map(h => h.toString())}]`);

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

    const recipientBalance = await testAccounts.tokenContract.methods
      .balance_of_public(recipient)
      .simulate({ from: testAccounts.tokenAdminAddress });
    logger.info(`recipientBalance: ${recipientBalance}`);
    // expect(recipientBalance).toBe(100n * transferAmount);

    // for (const w of testAccounts.wallets) {
    //   expect(MINT_AMOUNT - ROUNDS * transferAmount).toBe(
    //     await testAccounts.tokenContract.methods.balance_of_public(w.getAddress()).simulate(),
    //   );
    // }

    // expect(ROUNDS * transferAmount * BigInt(testAccounts.wallets.length)).toBe(
    //   await testAccounts.tokenContract.methods.balance_of_public(recipient).simulate(),
    // );
  });
});
