import { type AztecNode, SponsoredFeePaymentMethod, readFieldCompressedString } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { TestWallet } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import {
  type TestAccounts,
  createWalletAndAztecNodeClient,
  deploySponsoredTestAccounts,
} from './setup_test_wallets.js';
import { setupEnvironment, startPortForwardForRPC } from './utils.js';

const config = setupEnvironment(process.env);

describe('token transfer test', () => {
  jest.setTimeout(10 * 60 * 2000); // 20 minutes

  const logger = createLogger(`e2e:spartan-test:transfer`);
  const MINT_AMOUNT = 1n;

  const ROUNDS = 1n;

  let testAccounts: TestAccounts;
  const forwardProcesses: ChildProcess[] = [];
  let wallet: TestWallet;
  let aztecNode: AztecNode;
  let cleanup: undefined | (() => Promise<void>);

  afterAll(async () => {
    await cleanup?.();
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    const { process, port } = await startPortForwardForRPC(config.NAMESPACE);
    forwardProcesses.push(process);
    const rpcUrl = `http://127.0.0.1:${port}`;
    ({ wallet, aztecNode, cleanup } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, logger));

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

    for (const a of testAccounts.accounts) {
      expect(MINT_AMOUNT).toBe(
        await testAccounts.tokenContract.methods
          .balance_of_public(a)
          .simulate({ from: testAccounts.tokenAdminAddress }),
      );
    }

    expect(0n).toBe(
      await testAccounts.tokenContract.methods
        .balance_of_public(recipient)
        .simulate({ from: testAccounts.tokenAdminAddress }),
    );

    // For each round, make both private and public transfers
    for (let i = 1n; i <= ROUNDS; i++) {
      const txs = testAccounts.accounts.map(async a =>
        (await TokenContract.at(testAccounts.tokenAddress, testAccounts.wallet)).methods
          .transfer_in_public(a, recipient, transferAmount, 0)
          .prove({
            from: a,
            fee: { paymentMethod: new SponsoredFeePaymentMethod(await getSponsoredFPCAddress()) },
          }),
      );

      const provenTxs = await Promise.all(txs);

      await Promise.all(provenTxs.map(t => t.send().wait({ timeout: 600 })));
    }

    for (const a of testAccounts.accounts) {
      expect(MINT_AMOUNT - ROUNDS * transferAmount).toBe(
        await testAccounts.tokenContract.methods.balance_of_public(a).simulate({ from: a }),
      );
    }

    expect(ROUNDS * transferAmount * BigInt(testAccounts.accounts.length)).toBe(
      await testAccounts.tokenContract.methods
        .balance_of_public(recipient)
        .simulate({ from: testAccounts.tokenAdminAddress }),
    );
  });
});
