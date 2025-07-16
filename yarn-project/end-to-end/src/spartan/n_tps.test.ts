import { Fr, ProvenTx, Tx, readFieldCompressedString, sleep } from '@aztec/aztec.js';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { type TestWallets, deployTestWalletWithTokens, setupTestWalletsWithTokens } from './setup_test_wallets.js';
import { isK8sConfig, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

async function deployTestWalletWithRetry(
  pxeUrl: string,
  nodeUrl: string,
  ethereumHosts: string[],
  mnemonic: string,
  mintAmount: bigint,
  logger: Logger,
  maxRetries = 100,
): Promise<TestWallets> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info(`Deployment attempt ${attempt}/${maxRetries}`);

      const testWallets = await deployTestWalletWithTokens(
        pxeUrl,
        nodeUrl,
        ethereumHosts,
        mnemonic,
        mintAmount,
        logger,
      );

      logger.info(`Deployment successful on attempt ${attempt}`);
      return testWallets;
    } catch (error) {
      logger.error(`Deployment attempt ${attempt} failed:`, error);

      if (attempt === maxRetries) {
        logger.error(`All ${maxRetries} deployment attempts failed`);
        throw error;
      }

      // const waitTime = 10000;
      // logger.info(`Waiting ${waitTime}ms before retry...`);
      // await new Promise(resolve => setTimeout(resolve, ));
    }
  }

  throw new Error('Deployment failed after all retries');
}

describe('sustained 10 TPS test', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  const logger = createLogger(`e2e:spartan-test:sustained-10tps`);
  const MINT_AMOUNT = 10000n;
  const TEST_DURATION_SECONDS = 60;
  const TARGET_TPS = 10;
  const EXPECTED_TOTAL_TXS = TEST_DURATION_SECONDS * TARGET_TPS;

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

      logger.info('deploying test wallets');

      testWallets = await deployTestWalletWithRetry(
        PXE_URL,
        NODE_URL,
        ETHEREUM_HOSTS,
        L1_ACCOUNT_MNEMONIC,
        MINT_AMOUNT,
        logger,
        100,
      );
      logger.info(`testWallets ready 1`);
    } else {
      PXE_URL = config.PXE_URL;
      testWallets = await setupTestWalletsWithTokens(PXE_URL, MINT_AMOUNT, logger);
    }

    logger.info(
      `Test setup complete. Planning ${EXPECTED_TOTAL_TXS} transactions over ${TEST_DURATION_SECONDS} seconds at ${TARGET_TPS} TPS`,
    );
  });

  // it('can verify token setup', async () => {
  //   const name = readFieldCompressedString(await tokenContract.methods.private_get_name().simulate());
  //   expect(name).toBeDefined();
  //   expect(name.length).toBeGreaterThan(0);
  //   logger.info(`Token verified: ${name}`);
  // });

  it('can get info', async () => {
    const name = readFieldCompressedString(await testWallets.tokenAdminWallet.methods.private_get_name().simulate());
    expect(name).toBe(testWallets.tokenName);
  });

  it('can transfer 10tps tokens', async () => {
    const recipient = testWallets.recipientWallet.getAddress();
    const transferAmount = 1n;

    for (const w of testWallets.wallets) {
      expect(MINT_AMOUNT).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(w.getAddress()).simulate());
    }

    expect(0n).toBe(await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate());

    const wallet = testWallets.wallets[0];

    const baseTx = await (await TokenContract.at(testWallets.tokenAddress, wallet)).methods
      .transfer_in_public(wallet.getAddress(), recipient, transferAmount, 0)
      .prove();

    const TXS_PER_SECOND = 10;
    const TOTAL_SECONDS = 30;
    const TOTAL_TXS = TXS_PER_SECOND * TOTAL_SECONDS;

    const allSentTxs: any[] = []; // Store sent transactions separately

    let globalIdx = 0;

    for (let sec = 0; sec < TOTAL_SECONDS; sec++) {
      const secondStart = Date.now();

      const batchTxs: ProvenTx[] = [];

      for (let i = 0; i < TXS_PER_SECOND; i++, globalIdx++) {
        const clonedTxData = Tx.clone(baseTx);

        const nullifiers = clonedTxData.data.getNonEmptyNullifiers();
        if (nullifiers.length > 0) {
          const newNullifier = nullifiers[0].add(Fr.fromString(globalIdx.toString()));
          if (clonedTxData.data.forRollup) {
            clonedTxData.data.forRollup.end.nullifiers[0] = newNullifier;
          } else if (clonedTxData.data.forPublic) {
            clonedTxData.data.forPublic.nonRevertibleAccumulatedData.nullifiers[0] = newNullifier;
          }
        }

        const clonedTx = new ProvenTx(wallet, clonedTxData, []);
        batchTxs.push(clonedTx);
      }

      // Send transactions without waiting for inclusion
      for (let idx = 0; idx < batchTxs.length; idx++) {
        const tx = batchTxs[idx];
        const sentTx = tx.send();
        allSentTxs.push(sentTx);
        logger.info(`sec ${sec + 1}: sent tx ${globalIdx - TXS_PER_SECOND + idx + 1}`);
      }

      // 1 second spacing between batches
      const elapsed = Date.now() - secondStart;
      if (elapsed < 1000) {
        await sleep(1000 - elapsed);
      }
    }

    // Now wait for all transactions to be included
    logger.info(`All ${TOTAL_TXS} transactions sent. Waiting for inclusion...`);

    const inclusionPromises = allSentTxs.map((sentTx, idx) =>
      (async () => {
        try {
          await sentTx.wait({
            timeout: 600,
            interval: 1, // Check every 1 second (default)
            ignoreDroppedReceiptsFor: 2,
          });
          const receipt = await sentTx.getReceipt();
          logger.info(`tx ${idx + 1} included in block ${receipt.blockNumber}`);
          return { success: true, tx: sentTx };
        } catch (error) {
          logger.error(`tx ${idx + 1} was not included: ${error}`);
          return { success: false, tx: sentTx, error };
        }
      })(),
    );

    // Wait for every transaction to be included
    const results = await Promise.all(inclusionPromises);

    // Count successes and failures
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    expect(allSentTxs.length).toBe(TOTAL_TXS);
    logger.info(
      `Transaction inclusion summary: ${successCount} succeeded, ${failureCount} failed out of ${TOTAL_TXS} total`,
    );

    // Log failed transactions for debugging
    results
      .filter(r => !r.success)
      .forEach((result, idx) => {
        logger.warn(`Failed transaction ${idx + 1}: ${result.error}`);
      });

    // const recipientBalance = await tokenContract.methods.balance_of_public(recipient).simulate();
    const recipientBalance = await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate();

    logger.info(`recipientBalance after load test: ${recipientBalance}`);
  });
});
