import { type Logger, createLogger } from '@aztec/foundation/log';
import { sleep } from '@aztec/foundation/sleep';

import { describe, expect, it, jest } from '@jest/globals';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';

import {
  type DistributionPattern,
  WorkerClientManager,
  testChainConfig,
} from '../../testbench/worker_client_manager.js';

const TEST_TIMEOUT_MS = 600_000; // 10 minutes
jest.setTimeout(TEST_TIMEOUT_MS);

const PEERS_PER_RUN = 30;
const TIMEOUT_MS = 30_000;

const MISSING_TX_COUNTS = [10, 50, 100, 500] as const;
type MissingTxCount = number;

interface ScenarioBase {
  name: string;
  distribution: DistributionPattern;
  blockNumber: number;
  pinnedPeerIndex?: number; // index in worker list, if applicable
}

interface BenchmarkCase extends ScenarioBase {
  peers: number;
  missingTxCount: MissingTxCount;
  timeoutMs: number;
}

interface BenchmarkResult {
  missingTxCount: number;
  distribution: DistributionPattern;
  durationMs: number;
  fetchedCount: number;
  success: boolean;
}

interface JsonBenchmarkResult {
  name: string;
  value: number;
  unit: string;
}

const BASE_SCENARIOS: readonly ScenarioBase[] = [
  {
    name: 'uniform distribution',
    distribution: 'uniform',
    blockNumber: 1,
  },
  {
    name: 'sparse distribution',
    distribution: 'sparse',
    blockNumber: 2,
  },
  {
    name: 'pinned-only distribution',
    distribution: 'pinned-only',
    blockNumber: 3,
    pinnedPeerIndex: 1,
  },
];

const CASES: readonly BenchmarkCase[] = BASE_SCENARIOS.flatMap(base =>
  MISSING_TX_COUNTS.map(missingTxCount => ({
    ...base,
    peers: PEERS_PER_RUN,
    missingTxCount,
    timeoutMs: TIMEOUT_MS,
  })),
);

describe('BatchTxRequester Benchmarks', () => {
  const results: BenchmarkResult[] = [];

  let logger: Logger;
  let workerManager: WorkerClientManager | undefined;

  beforeAll(async () => {
    logger = createLogger('p2p:bench');
    const benchConfig = {
      ...testChainConfig,
      debugDisableColocationPenalty: true,
      p2pDisableStatusHandshake: true,
      bootstrapNodeEnrVersionCheck: false,
      bootstrapNodesAsFullPeers: true,
      maxPeerCount: PEERS_PER_RUN + 1,
      peerCheckIntervalMS: 1000,
      peerFailedBanTimeMs: 5_000,
      dialTimeoutMs: 10_000,
      individualRequestTimeoutMs: 30_000,
    };
    workerManager = new WorkerClientManager(logger, benchConfig);
    await workerManager.makeWorkerClients(PEERS_PER_RUN, {
      bootstrapMode: 'all',
      batchSize: 5,
      batchDelayMs: 1000,
    });
    await sleep(5000);
  });

  afterAll(async () => {
    try {
      if (workerManager) {
        await workerManager.cleanup();
      }
    } finally {
      await outputResults(results);
    }
  });

  beforeEach(async () => {
    logger.info(`Starting test ${expect.getState().currentTestName}`);
    // Ensure aggregator has sufficient peer connections before each case
    // to prevent degraded connectivity from previous cases propagating
    if (workerManager) {
      await workerManager.waitForConnectivity(Math.floor(PEERS_PER_RUN * 0.8), 15_000);
    }
  });

  describe.each(CASES)('$name (missing=$missingTxCount)', benchCase => {
    it('runs batch tx requester benchmark', async () => {
      if (!workerManager) {
        throw new Error('Worker manager not initialized');
      }

      const { missingTxCount, peers, distribution, timeoutMs, blockNumber } = benchCase;
      const pinnedPeerIndex = distribution === 'pinned-only' ? benchCase.pinnedPeerIndex : undefined;
      const seed = blockNumber * 1_000_000;

      logger.info(`Case=${benchCase.name}, missing=${missingTxCount}, peers=${peers}, timeoutMs=${timeoutMs}`);

      try {
        const result = await workerManager.runReqRespBenchmark({
          txCount: missingTxCount,
          distribution,
          timeoutMs,
          pinnedPeerIndex,
          blockNumber,
          seed,
        });

        results.push({
          missingTxCount,
          distribution,
          durationMs: result.durationMs,
          fetchedCount: result.fetchedCount,
          success: result.fetchedCount === missingTxCount,
        });

        logger.info(`fetched ${result.fetchedCount}/${missingTxCount} in ${result.durationMs.toFixed(0)}ms`);
      } catch (err: any) {
        logger.error(`Benchmark failed: ${err?.message ?? String(err)}`);

        results.push({
          missingTxCount,
          distribution,
          durationMs: timeoutMs,
          fetchedCount: 0,
          success: false,
        });

        throw err;
      }
    });
  });
});

/* eslint-disable no-console */
function toPrettyString(benchResults: BenchmarkResult[]): string {
  if (benchResults.length === 0) {
    return 'No benchmark results to display';
  }

  const lines: string[] = [];

  lines.push('');
  lines.push('='.repeat(80));
  lines.push('BatchTxRequester Benchmark Results');
  lines.push('='.repeat(80));
  lines.push('');
  lines.push('| Distribution | Missing | Duration (ms) | Fetched | Success |');
  lines.push('|--------------|---------|---------------|---------|---------|');

  const sorted = [...benchResults].sort((a, b) => {
    if (a.distribution !== b.distribution) {
      return a.distribution.localeCompare(b.distribution);
    }
    return a.missingTxCount - b.missingTxCount;
  });

  for (const r of sorted) {
    lines.push(
      `| ${r.distribution.padEnd(12)} | ${String(r.missingTxCount).padStart(7)} | ` +
        `${r.durationMs.toFixed(0).padStart(13)} | ${String(r.fetchedCount).padStart(7)} | ${r.success ? '  Yes  ' : '  No   '} |`,
    );
  }

  lines.push('');
  lines.push('='.repeat(80));
  lines.push('');

  return lines.join('\n');
}

function toBenchmarkJSON(benchResults: BenchmarkResult[], indent = 2): string {
  const metrics: JsonBenchmarkResult[] = [];

  for (const result of benchResults) {
    const baseName = `BatchTxRequester/${result.distribution}/missing_${result.missingTxCount}`;
    metrics.push(
      {
        name: `${baseName}/duration`,
        unit: 'ms',
        value: result.durationMs,
      },
      {
        name: `${baseName}/fetched`,
        unit: 'txs',
        value: result.fetchedCount,
      },
    );
  }

  return JSON.stringify(metrics, null, indent);
}

async function outputResults(benchResults: BenchmarkResult[]): Promise<void> {
  if (process.env.BENCH_OUTPUT) {
    await mkdir(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
    await writeFile(process.env.BENCH_OUTPUT, toBenchmarkJSON(benchResults));
    return;
  }

  if (process.env.BENCH_OUTPUT_MD) {
    await mkdir(path.dirname(process.env.BENCH_OUTPUT_MD), { recursive: true });
    await writeFile(process.env.BENCH_OUTPUT_MD, toPrettyString(benchResults));
    return;
  }

  console.log(toPrettyString(benchResults));
}
