/**
 * ProposalTxCollector benchmark using the testbench worker architecture.
 *
 * This benchmark compares the performance of different tx collection strategies:
 * - BatchTxRequester: Uses smart/dumb peer strategy with parallel workers
 * - SendBatchRequest: Original implementation that balances requests across peers
 *
 * Usage:
 *   yarn tsx src/testbench/proposal_tx_collector_bench.ts [config-file]
 *
 * If no config file is specified, uses default benchmark parameters.
 */
import { createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import {
  type CollectorType,
  type DistributionPattern,
  type ReqRespBenchmarkResult,
  WorkerClientManager,
  testChainConfig,
} from './worker_client_manager.js';

const logger = createLogger('proposal-tx-collector-bench');

const DEFAULT_PEER_COUNT = 20;
const DEFAULT_TIMEOUT_MS = 80_000;

const TX_COUNTS = [10, 50, 100];
const DISTRIBUTIONS: DistributionPattern[] = ['uniform', 'sparse', 'pinned-only'];
const COLLECTOR_TYPES: CollectorType[] = ['batch-requester', 'send-batch-request'];

interface BenchmarkConfig {
  peerCount: number;
  txCounts: number[];
  distributions: DistributionPattern[];
  collectorTypes: CollectorType[];
  timeoutMs: number;
  pinnedPeerIndex: number;
}

function getDefaultConfig(): BenchmarkConfig {
  return {
    peerCount: DEFAULT_PEER_COUNT,
    txCounts: TX_COUNTS,
    distributions: DISTRIBUTIONS,
    collectorTypes: COLLECTOR_TYPES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    pinnedPeerIndex: 1,
  };
}

/* eslint-disable no-console */
function outputResults(results: ReqRespBenchmarkResult[]) {
  if (results.length === 0) {
    console.log('No benchmark results to display');
    return;
  }

  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(80));
  lines.push('ProposalTxCollector Benchmark Results (Testbench Worker Architecture)');
  lines.push('='.repeat(80));
  lines.push('');
  lines.push('| Collector           | Distribution | Missing | Duration (ms) | Fetched | Success |');
  lines.push('|---------------------|--------------|---------|---------------|---------|---------|');

  const sorted = [...results].sort((a, b) => {
    if (a.distribution !== b.distribution) {
      return a.distribution.localeCompare(b.distribution);
    }
    if (a.txCount !== b.txCount) {
      return a.txCount - b.txCount;
    }
    return a.collector.localeCompare(b.collector);
  });

  for (const r of sorted) {
    lines.push(
      `| ${r.collector.padEnd(19)} | ${r.distribution.padEnd(12)} | ${String(r.txCount).padStart(7)} | ` +
        `${r.durationMs.toFixed(0).padStart(13)} | ${String(r.fetchedCount).padStart(7)} | ${r.success ? '  Yes  ' : '  No   '} |`,
    );
  }

  lines.push('');
  lines.push('## Comparison Summary');
  lines.push('');

  const keys = [...new Set(sorted.map(r => `${r.distribution}:${r.txCount}`))];

  for (const key of keys) {
    const [distRaw, txCountRaw] = key.split(':');
    const dist = distRaw as DistributionPattern;
    const txCount = Number(txCountRaw);

    const batch = sorted.find(
      r => r.distribution === dist && r.txCount === txCount && r.collector === 'batch-requester',
    );
    const send = sorted.find(
      r => r.distribution === dist && r.txCount === txCount && r.collector === 'send-batch-request',
    );

    if (!batch || !send) {
      continue;
    }

    if (!batch.success || !send.success) {
      lines.push(
        `- ${dist} (txCount=${txCount}): cannot compare reliably (success: batch=${batch.success}, send=${send.success})`,
      );
      continue;
    }

    const faster = batch.durationMs <= send.durationMs ? 'BatchTxRequester' : 'SendBatchRequest';
    const slower = faster === 'BatchTxRequester' ? 'SendBatchRequest' : 'BatchTxRequester';

    const delta = Math.abs(send.durationMs - batch.durationMs);
    const pct = (delta / Math.max(batch.durationMs, send.durationMs)) * 100;

    lines.push(`- ${dist} (txCount=${txCount}): ${faster} is ${pct.toFixed(1)}% faster than ${slower}`);
  }

  lines.push('');
  lines.push('='.repeat(80));
  lines.push('');

  console.log(lines.join('\n'));
}
/* eslint-enable no-console */

async function main() {
  const config = getDefaultConfig();

  logger.info('Starting ProposalTxCollector benchmark');
  logger.info(`Configuration: peers=${config.peerCount}, txCounts=${config.txCounts.join(',')}`);

  const workerManager = new WorkerClientManager(logger, testChainConfig);

  try {
    await workerManager.makeWorkerClients(config.peerCount);

    await sleep(5000);
    logger.info('All workers ready, starting benchmarks...');

    const results: ReqRespBenchmarkResult[] = [];
    let benchNumber = 0;
    const totalBenchmarks = config.txCounts.length * config.distributions.length * config.collectorTypes.length;

    for (const txCount of config.txCounts) {
      for (const distribution of config.distributions) {
        for (const collectorType of config.collectorTypes) {
          benchNumber++;
          logger.info(
            `[${benchNumber}/${totalBenchmarks}] Running: txCount=${txCount}, distribution=${distribution}, collector=${collectorType}`,
          );

          try {
            const result = await workerManager.runReqRespBenchmark({
              txCount,
              distribution,
              collectorType,
              timeoutMs: config.timeoutMs,
              pinnedPeerIndex: distribution === 'pinned-only' ? config.pinnedPeerIndex : undefined,
            });

            results.push(result);

            logger.info(
              `  Result: fetched=${result.fetchedCount}/${txCount}, duration=${result.durationMs.toFixed(0)}ms, success=${result.success}`,
            );
          } catch (err: any) {
            logger.error(`  Failed: ${err?.message ?? String(err)}`);

            results.push({
              txCount,
              distribution,
              collector: collectorType,
              durationMs: config.timeoutMs,
              fetchedCount: 0,
              success: false,
              error: err?.message ?? String(err),
            });
          }

          await sleep(1000);
        }
      }
    }

    outputResults(results);
  } finally {
    logger.info('Cleaning up...');
    await workerManager.cleanup();
  }
}

main().catch(error => {
  logger.error('Benchmark failed:', error);
  process.exit(1);
});
