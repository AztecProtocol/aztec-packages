import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import type { AztecNode } from '@aztec/aztec.js/node';
import { readFieldCompressedString } from '@aztec/aztec.js/utils';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { ProvenTx, TestWallet, proveInteraction } from '@aztec/test-wallet/server';

import { jest } from '@jest/globals';
import type { ChildProcess } from 'child_process';

import { getSponsoredFPCAddress } from '../fixtures/utils.js';
import { createWalletAndAztecNodeClient, deploySponsoredTestAccounts } from './setup_test_wallets.js';
import type { TestAccounts } from './setup_test_wallets.js';
import { type TestConfig, setValidatorTxDrop, setupEnvironment, startPortForwardForRPC } from './utils.js';

describe('reqresp effectiveness under tx drop', () => {
  jest.setTimeout(60 * 60 * 1000);

  const logger = createLogger(`e2e:spartan-test:reqresp-effectiveness`);

  const config: TestConfig = { ...setupEnvironment(process.env) };
  const TEST_DURATION_SECONDS = 10;
  const TARGET_TPS = 10;
  const TOTAL_TXS = TEST_DURATION_SECONDS * TARGET_TPS;
  const MINT_AMOUNT = 10000n;

  let wallet: TestWallet;
  let aztecNode: AztecNode;
  let cleanup: undefined | (() => Promise<void>);
  let testAccounts: TestAccounts;
  let recipient: any;
  const forwardProcesses: ChildProcess[] = [];

  afterAll(async () => {
    // Reset validators to default (no tx drop)
    try {
      await setValidatorTxDrop({
        namespace: config.NAMESPACE,
        enabled: false,
        probability: 0,
        logger,
      });
    } catch (e) {
      logger.warn(`Failed to reset validator tx drop flags: ${String(e)}`);
    }
    await cleanup?.();
    forwardProcesses.forEach(p => p.kill());
  });

  beforeAll(async () => {
    logger.info('Starting port forward for PXE');
    const { process: aztecRpcProcess, port: aztecRpcPort } = await startPortForwardForRPC(config.NAMESPACE);
    forwardProcesses.push(aztecRpcProcess);
    const rpcUrl = `http://127.0.0.1:${aztecRpcPort}`;

    const {
      wallet: _wallet,
      aztecNode: _aztecNode,
      cleanup: _cleanup,
    } = await createWalletAndAztecNodeClient(rpcUrl, config.REAL_VERIFIER, logger);
    cleanup = _cleanup;
    wallet = _wallet;
    aztecNode = _aztecNode;
    testAccounts = await deploySponsoredTestAccounts(wallet, aztecNode, MINT_AMOUNT, logger);
    recipient = testAccounts.recipientAddress;
    const name = readFieldCompressedString(
      await testAccounts.tokenContract.methods.private_get_name().simulate({ from: testAccounts.tokenAdminAddress }),
    );
    expect(name).toBe(testAccounts.tokenName);
  });

  async function runLoadAndMeasure(probability: number) {
    logger.info(`Applying tx drop: enabled=true, probability=${probability}`);

    // Pre-prove load
    const sponsor = new SponsoredFeePaymentMethod(await getSponsoredFPCAddress());
    const transferAmount = 1n;
    const txs: ProvenTx[] = await Promise.all(
      Array.from({ length: TOTAL_TXS }, () =>
        proveInteraction(
          wallet,
          testAccounts.tokenContract.methods.transfer_in_public(
            testAccounts.tokenAdminAddress,
            recipient,
            transferAmount,
            0,
          ),
          { from: testAccounts.tokenAdminAddress, fee: { paymentMethod: sponsor } },
        ),
      ),
    );

    if (!(probability == 0)) {
      await setValidatorTxDrop({
        namespace: config.NAMESPACE,
        enabled: true,
        probability,
        logger,
      });
    }

    const sends: Array<{ sentAt: number; promise: ReturnType<ProvenTx['send']> }[]> = [];
    let sentSoFar = 0;
    for (let sec = 0; sec < TEST_DURATION_SECONDS; sec++) {
      const secondStart = Date.now();
      const batch = txs.splice(0, TARGET_TPS);
      const sentBatch = batch.map((tx, i) => {
        const sent = tx.send();
        logger.info(`p=${probability} sec ${sec + 1}: sent tx ${sentSoFar + i + 1}`);
        return { sentAt: Date.now(), promise: sent };
      });
      sends.push(sentBatch);
      sentSoFar += batch.length;
      const elapsed = Date.now() - secondStart;
      if (elapsed < 1000) {
        await sleep(1000 - elapsed);
      }
    }

    // Collect tx inclusion time
    const latencies: number[] = [];
    let included = 0;
    let failed = 0;
    await Promise.all(
      sends.flat().map(async ({ sentAt, promise }, idx) => {
        try {
          await promise.wait({ timeout: 180, interval: 1, ignoreDroppedReceiptsFor: 2 });
          const receipt = await promise.getReceipt();
          if (receipt?.blockNumber !== undefined) {
            included++;
            const l = Date.now() - sentAt;
            latencies.push(l);
          } else {
            failed++;
          }
        } catch (err) {
          failed++;
          logger.warn(`tx ${idx + 1} failed: ${String(err)}`);
        }
      }),
    );

    const pct = (p: number) => latencies[Math.floor((latencies.length - 1) * p)] ?? 0;
    latencies.sort((a, b) => a - b);
    const p50 = pct(0.5);
    const p90 = pct(0.9);
    const p99 = pct(0.99);

    logger.info(
      `Drop p=${probability}: included=${included}/${TOTAL_TXS}, failed=${failed}, latency(ms) p50=${p50}, p90=${p90}, p99=${p99}`,
    );

    expect(included + failed).toBe(TOTAL_TXS);
    // Soft assertion: inclusion should remain reasonable even under drop
    expect(included).toBeGreaterThan(0);
  }

  it('measures req/resp effectiveness across drop probabilities', async () => {
    // Tx drop probabilities
    for (const p of [0.1, 0.3, 0.5]) {
      await runLoadAndMeasure(p);
    }
  });
});
