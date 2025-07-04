import { Fr, ProvenTx, Tx, readFieldCompressedString, sleep } from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';
import { TokenContract } from '@aztec/noir-contracts.js/Token';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { type TestWallets, deployTestWalletWithTokens, setupTestWalletsWithTokens } from './setup_test_wallets.js';
import { isK8sConfig, setupEnvironment, startPortForward } from './utils.js';

const config = setupEnvironment(process.env);

describe('sustained 10 TPS test', () => {
  jest.setTimeout(20 * 60 * 1000); // 20 minutes

  const logger = createLogger(`e2e:spartan-test:sustained-10tps`);
  const MINT_AMOUNT = 10000n; // Enough for many transactions
  const TEST_DURATION_SECONDS = 60; // 1 minute of sustained 10 TPS
  const TARGET_TPS = 10;
  const EXPECTED_TOTAL_TXS = TEST_DURATION_SECONDS * TARGET_TPS;
  const _TX_INTERVAL_MS = 1000 / TARGET_TPS; // 100ms between transactions (unused after refactor)

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

      logger.info('Deploying test wallets for sustained 10 TPS test...');
      testWallets = await deployTestWalletWithTokens(
        PXE_URL,
        NODE_URL,
        ETHEREUM_HOSTS,
        L1_ACCOUNT_MNEMONIC,
        MINT_AMOUNT,
        logger,
      );
      logger.info('Test wallets deployed successfully');
    } else {
      PXE_URL = config.PXE_URL;
      testWallets = await setupTestWalletsWithTokens(PXE_URL, MINT_AMOUNT, logger);
    }

    expect(BigInt(EXPECTED_TOTAL_TXS)).toBeLessThanOrEqual(MINT_AMOUNT);
    logger.info(
      `Test setup complete. Planning ${EXPECTED_TOTAL_TXS} transactions over ${TEST_DURATION_SECONDS} seconds at ${TARGET_TPS} TPS`,
    );
  });

  it('can verify token setup', async () => {
    const name = readFieldCompressedString(await testWallets.tokenAdminWallet.methods.private_get_name().simulate());
    expect(name).toBe(testWallets.tokenName);
    logger.info(`Token verified: ${name}`);
  });

  it('can transfer 1 token privately and publicly', async () => {
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
    const TOTAL_SECONDS = 60;
    const TOTAL_TXS = TXS_PER_SECOND * TOTAL_SECONDS;

    const allSendPromises: Promise<any>[] = [];

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

        batchTxs.push(new ProvenTx(wallet, clonedTxData));
      }

      allSendPromises.push(
        ...batchTxs.map((tx, idx) =>
          (async () => {
            const sentTx = tx.send();
            logger.info(`sec ${sec + 1}: sent tx ${idx + 1} (global #${globalIdx - TXS_PER_SECOND + idx + 1})`);
            await sentTx.wait({ timeout: 600 });
            const receipt = await sentTx.getReceipt();
            logger.info(`sec ${sec + 1}: tx included in block ${receipt.blockNumber}`);
            return sentTx;
          })(),
        ),
      );

      // Ensure we maintain ~1 second spacing between batches
      const elapsed = Date.now() - secondStart;
      if (elapsed < 1000) {
        await sleep(1000 - elapsed);
      }
    }

    // Wait for every transaction to be sent
    await Promise.all(allSendPromises);

    logger.info(`All ${TOTAL_TXS} transactions sent and included.`);
    expect(allSendPromises.length).toBe(TOTAL_TXS);

    const recipientBalance = await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate();
    logger.info(`recipientBalance after load test: ${recipientBalance}`);

    expect(recipientBalance).toBe(BigInt(TOTAL_TXS));
  });

  // it('maintains exactly 10 TPS for sustained period', async () => {
  //   const recipient = testWallets.recipientWallet.getAddress();
  //   const transferAmount = 1n;
  //   const wallet = testWallets.wallets[0];

  //   // Verify initial balances
  //   const initialBalance = await testWallets.tokenAdminWallet.methods.balance_of_public(wallet.getAddress()).simulate();
  //   const initialRecipientBalance = await testWallets.tokenAdminWallet.methods.balance_of_public(recipient).simulate();

  //   logger.info(`Initial sender balance: ${initialBalance}`);
  //   logger.info(`Initial recipient balance: ${initialRecipientBalance}`);
  //   expect(initialBalance).toBe(MINT_AMOUNT);
  //   expect(initialRecipientBalance).toBe(0n);

  //   const startTime = Date.now();
  //   const transactions: Array<{ txIndex: number; sentAt: number; receipt?: any }> = [];

  //   logger.info(
  //     `Starting sustained 10 TPS test for ${TEST_DURATION_SECONDS} seconds (${TX_INTERVAL_MS}ms intervals)...`,
  //   );

  //   // Send exactly 10 transactions per second (1 every 100ms)
  //   for (let i = 0; i < EXPECTED_TOTAL_TXS; i++) {
  //     const targetTime = startTime + i * TX_INTERVAL_MS;
  //     const currentTime = Date.now();

  //     // Wait until it's time to send the next transaction
  //     if (currentTime < targetTime) {
  //       await sleep(targetTime - currentTime);
  //     }

  //     try {
  //       // Create and send transaction
  //       const interaction = (await TokenContract.at(testWallets.tokenAddress, wallet)).methods.transfer_in_public(
  //         wallet.getAddress(),
  //         recipient,
  //         transferAmount,
  //         0,
  //       );

  //       const tx = await interaction.prove();
  //       const sentTx = tx.send();
  //       const actualSentTime = Date.now();

  //       if (i % 50 === 0 || i < 10) {
  //         // Log every 50th transaction + first 10
  //         logger.info(`Transaction ${i + 1}/${EXPECTED_TOTAL_TXS} sent at ${actualSentTime - startTime}ms`);
  //       }

  //       transactions.push({
  //         txIndex: i,
  //         sentAt: actualSentTime,
  //       });

  //       // For 10 TPS, we don't wait for each individual transaction
  //       // Instead, we'll check them in batches to maintain throughput
  //       sentTx
  //         .wait({ timeout: 60000 })
  //         .then(receipt => {
  //           transactions[i].receipt = receipt;
  //           if (i % 50 === 0 || i < 10) {
  //             logger.info(`Transaction ${i + 1} included in block ${receipt.blockNumber}`);
  //           }
  //         })
  //         .catch(error => {
  //           logger.error(`Transaction ${i + 1} failed to be included:`, error);
  //         });
  //     } catch (error) {
  //       logger.error(`Transaction ${i + 1} failed to send:`, error);
  //       // Continue with next transaction instead of failing the whole test
  //     }
  //   }

  //   // Wait for all transactions to be included
  //   logger.info('All transactions sent. Waiting for inclusion...');
  //   let attempts = 0;
  //   const maxAttempts = 120; // 2 minutes

  //   while (attempts < maxAttempts) {
  //     const includedTxs = transactions.filter(tx => tx.receipt);
  //     logger.info(`${includedTxs.length}/${transactions.length} transactions included`);

  //     if (includedTxs.length === transactions.length) {
  //       break;
  //     }

  //     await sleep(1000);
  //     attempts++;
  //   }

  //   const endTime = Date.now();
  //   const totalDuration = endTime - startTime;
  //   const actualTPS = (transactions.length * 1000) / totalDuration;
  //   const includedTxs = transactions.filter(tx => tx.receipt);

  //   logger.info(`Test completed in ${totalDuration}ms`);
  //   logger.info(`Sent ${transactions.length} transactions`);
  //   logger.info(`Included ${includedTxs.length} transactions`);
  //   logger.info(`Actual send TPS: ${actualTPS.toFixed(3)}`);
  //   logger.info(`Target TPS: ${TARGET_TPS}`);
  //   logger.info(`Success rate: ${((includedTxs.length / transactions.length) * 100).toFixed(1)}%`);

  //   // Verify most transactions were sent
  //   expect(transactions.length).toBeGreaterThan(EXPECTED_TOTAL_TXS * 0.9); // At least 90% sent

  //   // Verify reasonable inclusion rate (at least 80% included)
  //   expect(includedTxs.length).toBeGreaterThan(EXPECTED_TOTAL_TXS * 0.8);

  //   // Verify TPS is close to target (within 20% tolerance for 10 TPS)
  //   expect(actualTPS).toBeGreaterThan(TARGET_TPS * 0.8);
  //   expect(actualTPS).toBeLessThan(TARGET_TPS * 1.2);

  //   logger.info('Sustained 10 TPS test completed successfully!');
  // });
});
