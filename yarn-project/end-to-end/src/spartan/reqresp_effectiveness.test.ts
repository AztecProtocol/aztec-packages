import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { readFieldCompressedString } from '@aztec/aztec.js/utils';
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';
import { ProvenTx, TestWallet, proveInteraction } from '@aztec/test-wallet/server';

import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';

import { getSponsoredFPCAddress, waitForProvenChain } from '../fixtures/utils.js';
import { createWalletAndAztecNodeClient, deploySponsoredTestAccounts } from './setup_test_wallets.js';
import type { TestAccounts } from './setup_test_wallets.js';
import {
  type TestConfig,
  setValidatorFastTx,
  setValidatorTxDrop,
  setupEnvironment,
  startPortForward,
  startPortForwardForRPC,
} from './utils.js';

describe('reqresp effectiveness under tx drop', () => {
  jest.setTimeout(60 * 60 * 1000);

  const logger = createLogger(`e2e:spartan-test:reqresp-effectiveness`);

  const config: TestConfig = { ...setupEnvironment(process.env) };
  const TEST_DURATION_SECONDS = Number(process.env.REQRESP_BENCH_DURATION_S ?? 1);
  const TARGET_TPS = Number(process.env.REQRESP_BENCH_TARGET_TPS ?? 10);
  const TOTAL_TXS = TEST_DURATION_SECONDS * TARGET_TPS;
  const MINT_AMOUNT = 10000n;
  const FAST_ENABLED = (process.env.TX_COLLECTION_FAST_ENABLED ?? 'true').toLowerCase() === 'true' ? 'on' : 'off';

  let wallet: TestWallet;
  let cleanup: undefined | (() => Promise<void>);
  let testAccounts: TestAccounts;
  const forwardProcesses: Array<{ kill: () => void }> = [];

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
    logger.info(`Benchmark mode: fast_tx=${FAST_ENABLED}, duration_s=${TEST_DURATION_SECONDS}, tps=${TARGET_TPS}`);
    logger.info('Starting port forward for PXE');
    logger.info('Opening RPC port-forward to aztec-node service...');
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
    testAccounts = await deploySponsoredTestAccounts(wallet, _aztecNode, MINT_AMOUNT, logger);
    const name = readFieldCompressedString(
      await testAccounts.tokenContract.methods.private_get_name().simulate({ from: testAccounts.tokenAdminAddress }),
    );
    expect(name).toBe(testAccounts.tokenName);
    await waitForProvenChain(testAccounts.aztecNode);
  });

  async function portForwardPrometheus() {
    // Try Prometheus in dedicated metrics namespace; fall back to network namespace
    let promPort = 0;
    let promProc: { kill: () => void } | undefined;
    {
      const { process: p, port } = await startPortForward({
        resource: `svc/metrics-prometheus-server`,
        namespace: 'metrics',
        containerPort: 80,
      });
      promProc = p;
      promPort = port;
      if (promPort === 0 && p) {
        p.kill();
      }
    }
    if (promPort === 0) {
      const { process: p, port } = await startPortForward({
        resource: `svc/prometheus-server`,
        namespace: config.NAMESPACE,
        containerPort: 80,
      });
      promProc = p;
      promPort = port;
    }
    if (promProc && promPort !== 0) {
      forwardProcesses.push(promProc);
      return `http://127.0.0.1:${promPort}/api/v1`;
    }
    logger.warn('Prometheus not reachable; skipping metric scraping for this run.');
    return '';
  }

  async function scrapeTxCollectorCounts(promBaseApi: string, windowSeconds: number) {
    if (!promBaseApi) {
      return {};
    }
    const expr = `sum by (aztec_tx_collection_method) (increase(aztec_tx_collector_tx_count{k8s_namespace_name="${config.NAMESPACE}"}[${windowSeconds}s]))`;
    const url = `${promBaseApi}/query?query=${encodeURIComponent(expr)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to query Prometheus: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as any;
    const result = (data?.data?.result ?? []) as Array<{ metric: Record<string, string>; value: [number, string] }>;
    const out: Record<string, number> = {};
    for (const r of result) {
      const method = r.metric['aztec_tx_collection_method'] ?? 'unknown';
      const val = Number(r.value?.[1] ?? 0);
      out[method] = val;
    }
    return out;
  }

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
            testAccounts.recipientAddress,
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
            logger.info(`tx ${idx + 1} included in block ${receipt.blockNumber} after ${l}ms`);
          } else {
            failed++;
            logger.warn(`tx ${idx + 1} has no blockNumber in receipt`);
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
    return { included, failed, p50, p90, p99 };
  }

  // it('measures req/resp effectiveness across drop probabilities', async () => {
  //   // Tx drop probabilities
  //   for (const p of [0.0, 0.7]) {
  //     await runLoadAndMeasure(p);
  //   }
  // });

  it('scrapes tx collection metrics before and after fast tx switch', async () => {
    const promBaseApi = await portForwardPrometheus();
    // Choose a window a bit larger than the send duration to capture exports
    const windowSeconds = Math.max(TEST_DURATION_SECONDS + 10, 30);

    // Normalize to OFF then ON to compare both states regardless of initial
    const initialFast = (process.env.TX_COLLECTION_FAST_ENABLED ?? 'true').toLowerCase() === 'true';

    // First: ensure fast is OFF
    if (initialFast) {
      logger.info('Disabling fast tx collection for baseline metrics');
      await setValidatorFastTx({ namespace: config.NAMESPACE, enabled: false, logger });
      // await reinitRpcAndClients();
      await sleep(5_000);
    }
    // Baseline load and scrape
    const baselineStats = await runLoadAndMeasure(0);
    await sleep(10_000);
    const before = await scrapeTxCollectorCounts(promBaseApi, windowSeconds);
    logger.info(`Tx collection metrics with fast=off: ${JSON.stringify(before)}`);
    logger.info(`Baseline fast=off stats: ${JSON.stringify(baselineStats)}`);

    // Enable fast tx collection
    logger.info('Enabling fast tx collection for comparison metrics');
    await setValidatorFastTx({ namespace: config.NAMESPACE, enabled: true, logger });
    // await reinitRpcAndClients();
    await sleep(5_000);

    // Comparison load and scrape
    const fastStats = await runLoadAndMeasure(0);
    await sleep(10_000);
    const after = await scrapeTxCollectorCounts(promBaseApi, windowSeconds);
    logger.info(`Tx collection metrics with fast=on: ${JSON.stringify(after)}`);
    logger.info(`Fast=on stats: ${JSON.stringify(fastStats)}`);

    logger.info(`before fast-node-rpc=${before['fast-node-rpc']}, fast-req-resp=${before['fast-req-resp']}`);
    logger.info(`after fast-node-rpc=${after['fast-node-rpc']}, fast-req-resp=${after['fast-req-resp']}`);
    const fastActivity =
      (after['fast-node-rpc'] ?? 0) +
      (after['fast-req-resp'] ?? 0) -
      ((before['fast-node-rpc'] ?? 0) + (before['fast-req-resp'] ?? 0));
    expect(fastActivity).toBeGreaterThanOrEqual(0);
  });
});
