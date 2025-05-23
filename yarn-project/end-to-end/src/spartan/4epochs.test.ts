import { readFieldCompressedString } from '@aztec/aztec.js';
import { RollupCheatCodes } from '@aztec/aztec.js/testing';
import { getL1ContractsConfigEnvVars } from '@aztec/ethereum';
import { EthCheatCodesWithState } from '@aztec/ethereum/test';
import { createLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { type TestWallets, deployTestWalletWithTokens, setupTestWalletsWithTokens } from './setup_test_wallets.js';
import { isK8sConfig, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

describe('token transfer test', () => {
  jest.setTimeout(10 * 60 * 4000); // 40 minutes

  const logger = createLogger(`e2e:spartan:4epochs`);
  const l1Config = getL1ContractsConfigEnvVars();

  // We want plenty of minted tokens for a lot of slots that fill up multiple epochs
  const MINT_AMOUNT = 2000000n;
  const TEST_EPOCHS = 4;
  const MAX_MISSED_SLOTS = 10n;
  const ROUNDS = BigInt(l1Config.aztecEpochDuration * TEST_EPOCHS);

  let testWallets: TestWallets;
  let PXE_URL: string;
  let ETHEREUM_HOSTS: string[];
  const forwardProcesses: ChildProcess[] = [];

  beforeAll(async () => {
    if (isK8sConfig(config)) {
      const { process: pxeProcess, port: pxePort } = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-pxe`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_PXE_PORT,
      });
      forwardProcesses.push(pxeProcess);
      PXE_URL = `http://127.0.0.1:${pxePort}`;

      if (config.SEPOLIA_RUN !== 'true') {
        const { process: ethProcess, port: ethPort } = await startPortForward({
          resource: `svc/${config.INSTANCE_NAME}-aztec-network-eth-execution`,
          namespace: config.NAMESPACE,
          containerPort: config.CONTAINER_ETHEREUM_PORT,
        });
        forwardProcesses.push(ethProcess);
        ETHEREUM_HOSTS = [`http://127.0.0.1:${ethPort}`];
      } else {
        if (!config.ETHEREUM_HOSTS) {
          throw new Error('ETHEREUM_HOSTS must be set for sepolia runs');
        }
        ETHEREUM_HOSTS = config.ETHEREUM_HOSTS.split(',');
      }

      const { process: sequencerProcess, port: sequencerPort } = await startPortForward({
        resource: `svc/${config.INSTANCE_NAME}-aztec-network-validator`,
        namespace: config.NAMESPACE,
        containerPort: config.CONTAINER_SEQUENCER_PORT,
      });
      forwardProcesses.push(sequencerProcess);
      const NODE_URL = `http://127.0.0.1:${sequencerPort}`;

      const L1_ACCOUNT_MNEMONIC = config.L1_ACCOUNT_MNEMONIC;

      testWallets = await deployTestWalletWithTokens(
        PXE_URL,
        NODE_URL,
        ETHEREUM_HOSTS,
        L1_ACCOUNT_MNEMONIC,
        MINT_AMOUNT,
        logger,
      );
    } else {
      PXE_URL = config.PXE_URL;
      ETHEREUM_HOSTS = config.ETHEREUM_HOSTS.split(',');
      testWallets = await setupTestWalletsWithTokens(PXE_URL, MINT_AMOUNT, logger);
    }

    expect(ROUNDS).toBeLessThanOrEqual(MINT_AMOUNT);
    logger.info(`Tested wallets setup: ${ROUNDS} < ${MINT_AMOUNT}`);
  });

  afterAll(() => {
    forwardProcesses.forEach(p => p.kill());
  });

  it('can get info', async () => {
    const name = readFieldCompressedString(await testWallets.tokenAdminWallet.methods.private_get_name().simulate());
    expect(name).toBe(testWallets.tokenName);
    logger.info(`Token name verified: ${name}`);
  });

  it('transfer tokens for 4 epochs', async () => {
    const ethCheatCodes = new EthCheatCodesWithState(ETHEREUM_HOSTS);
    const l1ContractAddresses = await testWallets.pxe.getNodeInfo().then(n => n.l1ContractAddresses);
    // Get 4 epochs
    const rollupCheatCodes = new RollupCheatCodes(ethCheatCodes, l1ContractAddresses);
    logger.info(`Deployed L1 contract addresses: ${JSON.stringify(l1ContractAddresses)}`);
    const recipient = testWallets.recipientWallet.getAddress();
    const transferAmount = 1n;

    for (const w of testWallets.wallets) {
      expect(MINT_AMOUNT).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate());
    }

    logger.info('Minted tokens');

    expect(0n).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate());

    // For each round, make both private and public transfers
    const startSlot = await rollupCheatCodes.getSlot();
    for (let i = 1n; i <= ROUNDS; i++) {
      const interactions = await Promise.all([
        ...testWallets.wallets.map(async w =>
          (await TokenContract.at(testWallets.tokenAddress, w)).methods.transfer_in_public(
            w.getAddress(),
            recipient,
            transferAmount,
            0,
          ),
        ),
      ]);

      logger.info(`Created interactions ${interactions.length} for round ${i} of ${ROUNDS}`);

      const txs = await Promise.all(interactions.map(async i => await i.prove()));

      logger.info(`Proved ${txs.length} in round ${i} of ${ROUNDS}`);

      await Promise.all(txs.map(t => t.send().wait({ timeout: 600 })));
      const currentSlot = await rollupCheatCodes.getSlot();
      expect(currentSlot).toBeLessThanOrEqual(startSlot + i + MAX_MISSED_SLOTS);
      const startEpoch = await rollupCheatCodes.getEpoch();
      logger.debug(
        `Successfully reached slot ${currentSlot} (iteration ${
          currentSlot - startSlot
        }/${ROUNDS}) (Epoch ${startEpoch})`,
      );
    }

    for (const w of testWallets.wallets) {
      expect(MINT_AMOUNT - ROUNDS * transferAmount).toBe(
        await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate(),
      );
    }

    expect(ROUNDS * transferAmount * BigInt(testWallets.wallets.length)).toBe(
      await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate(),
    );
  });
});
