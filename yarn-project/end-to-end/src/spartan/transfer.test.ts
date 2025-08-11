import { type PXE, SponsoredFeePaymentMethod, readFieldCompressedString } from '@aztec/aztec.js';
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
  const MINT_AMOUNT = 1n;

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
    const name = readFieldCompressedString(
      await testWallets.tokenAdminWallet.methods.private_get_name().simulate({ from: testWallets.tokenAdminAddress }),
    );
    expect(name).toBe(testWallets.tokenName);
  });

  it('can transfer 1 token privately and publicly', async () => {
    const recipient = testWallets.recipientWallet.getAddress();
    const transferAmount = 1n;

    for (const w of testWallets.wallets) {
      expect(MINT_AMOUNT).toBe(
        await testWallets.tokenAdminWallet.methods
          .balance_of_public(w.getAddress())
          .simulate({ from: testWallets.tokenAdminAddress }),
      );
    }

    expect(0n).toBe(
      await testWallets.tokenAdminWallet.methods
        .balance_of_public(recipient)
        .simulate({ from: testWallets.tokenAdminAddress }),
    );

    // For each round, make both private and public transfers
    for (let i = 1n; i <= ROUNDS; i++) {
      const txs = testWallets.wallets.map(async w =>
        (await TokenContract.at(testWallets.tokenAddress, w)).methods
          .transfer_in_public(w.getAddress(), recipient, transferAmount, 0)
          .prove({
            from: w.getAddress(),
            fee: { paymentMethod: new SponsoredFeePaymentMethod(await getSponsoredFPCAddress()) },
          }),
      );

      const provenTxs = await Promise.all(txs);

      await Promise.all(provenTxs.map(t => t.send().wait({ timeout: 600 })));
    }

    for (const w of testWallets.wallets) {
      expect(MINT_AMOUNT - ROUNDS * transferAmount).toBe(
        await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate({ from: w.getAddress() }),
      );
    }

    expect(ROUNDS * transferAmount * BigInt(testWallets.wallets.length)).toBe(
      await testWallets.tokenAdminWallet.methods
        .balance_of_public(recipient)
        .simulate({ from: testWallets.tokenAdminAddress }),
    );
  });
});
