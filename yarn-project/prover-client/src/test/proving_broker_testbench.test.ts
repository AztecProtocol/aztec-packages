/**
 * Proving Broker Performance Benchmarks
 *
 * These benchmarks test the KV database (production configuration) for realistic performance metrics.
 */
import { type L1ContractAddresses, L1ContractsNames } from '@aztec/ethereum';
import { times } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { ProvingRequestType } from '@aztec/stdlib/proofs';

import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { MockProofStore } from '../test/mock_proof_store.js';
import { defaultProverBrokerConfig } from './config.js';
import { makeRandomProvingJobId } from './fixtures.js';
import { PROOF_TYPES_IN_PRIORITY_ORDER, ProvingBroker } from './proving_broker.js';
import { KVBrokerDatabase } from './proving_broker_database/persisted.js';

const logger = createLogger('proving-broker-bench');
const benchTimer = new Timer();

async function createKVDatabase(l1Contracts?: L1ContractAddresses) {
  const directory = await mkdtemp(join(tmpdir(), 'proving-broker-bench'));
  const database = await KVBrokerDatabase.new({
    ...defaultProverBrokerConfig,
    dataDirectory: directory,
    l1Contracts:
      l1Contracts ??
      (Object.fromEntries(L1ContractsNames.map(name => [name, EthAddress.random()])) as L1ContractAddresses),
  });
  return { database, directory };
}

/**
 * Builds a flat list of jobs to enqueue/dequeue based on the counts per proof type.
 * @param proofCounts - Array whose indices correspond to `PROOF_TYPES_IN_PRIORITY_ORDER`.
 * @param epochGenerator - Function deciding which epoch a given job belongs to.
 */
function buildJobList(
  proofCounts: number[],
  epochGenerator: (index: number) => number = () => 1,
): Array<{ type: ProvingRequestType; epochNumber: number }> {
  const jobs: Array<{ type: ProvingRequestType; epochNumber: number }> = [];

  const proofTypeCounts = new Map<ProvingRequestType, number>(
    proofCounts
      .map((count, index): [ProvingRequestType, number] => [PROOF_TYPES_IN_PRIORITY_ORDER[index], count])
      .filter(([_, count]) => count > 0),
  );

  let jobIndex = 0;
  for (const [proofType, count] of proofTypeCounts) {
    times(count, () => {
      jobs.push({ type: proofType, epochNumber: epochGenerator(jobIndex++) });
    });
  }

  return jobs;
}

// Helper function to calculate percentiles from an array of numbers
function calculatePercentiles(values: number[]) {
  if (values.length === 0) {
    return { median: 0, p90: 0, p95: 0, p99: 0 };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const getPercentile = (p: number) => {
    const index = Math.floor((p / 100) * (sorted.length - 1));
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  };

  return {
    median: getPercentile(50),
    p90: getPercentile(90),
    p95: getPercentile(95),
    p99: getPercentile(99),
  };
}

/** Returns a deterministic pseudo-random generator (32-bit LCG). */
function makeSeededRng(seed = 1): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

interface EnqueueBenchmarkResults {
  avgEnqueueLatency: number;
  medianEnqueueLatency: number;
  p90EnqueueLatency: number;
  p95EnqueueLatency: number;
  p99EnqueueLatency: number;
  totalJobs: number;
  totalEnqueueTime: number;
  jobsPerSecond: number;
}

interface DequeueBenchmarkResults {
  avgDequeueLatency: number;
  medianDequeueLatency: number;
  p90DequeueLatency: number;
  p95DequeueLatency: number;
  p99DequeueLatency: number;
  totalJobs: number;
  jobsPerSecond: number;
  queueEmptyTime: number;
}

interface InitializationBenchmarkResults {
  initializationTime: number;
  totalJobs: number;
  jobsPerSecond: number;
  emptyCleanupTime: number;
  jobsRemovedByCleanup: number;
  fullCleanupTime: number;
}

interface GithubActionBenchmarkResult {
  name: string;
  value: number;
  unit: string;
  extra?: string;
}

const proofDistributionTestCases = [
  {
    name: 'minimum epoch',
    description: '1 block, 8 transactions', // 8 transactions per block = 8 total transactions
    proofCounts: [1, 0, 0, 1, 6, 4, 4, 4, 8, 1, 4, 0],
  },
  {
    name: 'small epoch',
    description: '6 blocks, 48 transactions', // 8 transactions per block = 48 total transactions
    proofCounts: [6, 0, 4, 1, 36, 24, 24, 24, 48, 6, 24, 0],
  },
  {
    name: 'medium epoch',
    description: '20 blocks, 400 transactions', // 20 transactions per block = 400 total transactions
    proofCounts: [20, 0, 18, 1, 360, 200, 200, 200, 400, 20, 80, 0],
  },
  {
    name: 'large epoch',
    description: '32 blocks, 6400 transactions', // 200 transactions per block = 6400 total transactions
    proofCounts: [32, 0, 30, 1, 6336, 3200, 3200, 3200, 6400, 32, 128, 0],
  },
  {
    name: 'maximum epoch',
    description: '32 blocks, 12,800 transactions', // 400 transactions per block = 12,800 total txs (all public)
    proofCounts: [32, 0, 30, 1, 12736, 12800, 0, 12800, 12800, 32, 128, 0],
  },
];

const agentCounts = [1, 10, 50];

const epochPatterns = [
  {
    name: 'single epoch',
    generator: () => 1,
  },
  {
    name: 'random epochs',
    generator: (() => {
      const rng = makeSeededRng();
      const maxEpochsToKeep = 1;
      const epochRange = maxEpochsToKeep + 1;
      return () => Math.floor(rng() * epochRange) + 1;
    })(),
  },
  {
    name: 'interleaved epochs',
    generator: (index: number) => {
      const maxEpochsToKeep = 1;
      const epochRange = maxEpochsToKeep + 1;
      return (index % epochRange) + 1;
    },
  },
];

class ProvingBrokerBenchmarkCollector {
  private results: GithubActionBenchmarkResult[] = [];

  addEnqueueResult(testName: string, results: EnqueueBenchmarkResults) {
    this.results.push({
      name: `proving_broker/enqueue/${testName}/avg_latency`,
      value: results.avgEnqueueLatency,
      unit: 'ms',
    });
    this.results.push({
      name: `proving_broker/enqueue/${testName}/median_latency`,
      value: results.medianEnqueueLatency,
      unit: 'ms',
    });
    this.results.push({
      name: `proving_broker/enqueue/${testName}/p95_latency`,
      value: results.p95EnqueueLatency,
      unit: 'ms',
    });
    this.results.push({
      name: `proving_broker/enqueue/${testName}/total_duration`,
      value: results.totalEnqueueTime,
      unit: 'ms',
    });
    this.results.push({
      name: `proving_broker/enqueue/${testName}/jobs_per_sec`,
      value: results.jobsPerSecond,
      unit: 'jobs/s',
    });
  }

  addDequeueResult(testName: string, results: DequeueBenchmarkResults, agentCount?: number) {
    const agentSuffix = agentCount ? `_${agentCount}agents` : '';
    this.results.push({
      name: `proving_broker/dequeue/${testName}${agentSuffix}/queue_empty_time`,
      value: results.queueEmptyTime,
      unit: 'ms',
    });
    this.results.push({
      name: `proving_broker/dequeue/${testName}${agentSuffix}/avg_dequeue_latency`,
      value: results.avgDequeueLatency,
      unit: 'ms',
    });
    this.results.push({
      name: `proving_broker/dequeue/${testName}${agentSuffix}/median_dequeue_latency`,
      value: results.medianDequeueLatency,
      unit: 'ms',
    });
    this.results.push({
      name: `proving_broker/dequeue/${testName}${agentSuffix}/p95_dequeue_latency`,
      value: results.p95DequeueLatency,
      unit: 'ms',
    });
  }

  addInitializationResult(testName: string, results: InitializationBenchmarkResults) {
    this.results.push({
      name: `proving_broker/initialization/${testName}/startup_time`,
      value: results.initializationTime,
      unit: 'ms',
    });
    this.results.push({
      name: `proving_broker/initialization/${testName}/jobs_per_sec`,
      value: results.jobsPerSecond,
      unit: 'jobs/s',
    });
    this.results.push({
      name: `proving_broker/initialization/${testName}/no_epoch_deletion_cleanup_time`,
      value: results.emptyCleanupTime,
      unit: 'ms',
    });
    this.results.push({
      name: `proving_broker/initialization/${testName}/full_epoch_deletion_cleanup_time`,
      value: results.fullCleanupTime,
      unit: 'ms',
    });
  }

  toPrettyString(): string {
    let output = '\nProving Broker Benchmark Results:\n';
    output += '='.repeat(50) + '\n';

    const enqueueResults = this.results.filter(r => r.name.includes('/enqueue/'));
    const dequeueResults = this.results.filter(r => r.name.includes('/dequeue/'));
    const initResults = this.results.filter(r => r.name.includes('/initialization/'));

    if (enqueueResults.length > 0) {
      output += '\nEnqueue Benchmarks:\n';
      output += '-'.repeat(20) + '\n';
      enqueueResults.forEach(result => {
        const testName = result.name.split('/')[2];
        const metric = result.name.split('/')[3];
        output += `  ${testName} ${metric}: ${result.value} ${result.unit}\n`;
      });
    }

    if (dequeueResults.length > 0) {
      output += '\nDequeue Benchmarks:\n';
      output += '-'.repeat(20) + '\n';
      dequeueResults.forEach(result => {
        const testName = result.name.split('/')[2];
        const metric = result.name.split('/')[3];
        output += `  ${testName} ${metric}: ${result.value} ${result.unit}\n`;
      });
    }

    if (initResults.length > 0) {
      output += '\nInitialization Benchmarks:\n';
      output += '-'.repeat(30) + '\n';
      initResults.forEach(result => {
        const testName = result.name.split('/')[2];
        const metric = result.name.split('/')[3];
        output += `  ${testName} ${metric}: ${result.value} ${result.unit}\n`;
      });
    }

    return output;
  }

  toGithubActionBenchmarkJSON(indent = 2): string {
    return JSON.stringify(this.results, null, indent);
  }

  getResults(): GithubActionBenchmarkResult[] {
    return this.results;
  }
}

describe('Proving Broker: Benchmarks', () => {
  let broker: ProvingBroker;
  let proofStore: MockProofStore;
  let databaseHandle: KVBrokerDatabase;
  let tempDirectory: string;
  let l1Contracts: L1ContractAddresses; // Store L1 contracts to reuse

  const benchmarkCollector = new ProvingBrokerBenchmarkCollector();

  beforeEach(async () => {
    // Generate L1 contracts once to reuse in the initialization test
    l1Contracts = Object.fromEntries(L1ContractsNames.map(name => [name, EthAddress.random()])) as L1ContractAddresses;

    // Initialize the broker with configured database type
    const { database, directory } = await createKVDatabase(l1Contracts);
    databaseHandle = database;
    tempDirectory = directory;

    broker = new ProvingBroker(databaseHandle);

    // Initialize the mock proof store to generate realistic GCP URI
    proofStore = new MockProofStore();

    // Start broker
    await broker.start();
  });

  afterEach(async () => {
    await broker.stop();
    await databaseHandle.close();
  });

  afterAll(async () => {
    // Clean up the temporary directory
    await rm(tempDirectory, { recursive: true, force: true, maxRetries: 3 });

    // Output benchmark results
    if (process.env.BENCH_OUTPUT) {
      const fs = await import('fs');
      const path = await import('path');
      fs.mkdirSync(path.dirname(process.env.BENCH_OUTPUT), { recursive: true });
      fs.writeFileSync(process.env.BENCH_OUTPUT, benchmarkCollector.toGithubActionBenchmarkJSON());
    } else if (process.env.BENCH_OUTPUT_MD) {
      const fs = await import('fs');
      fs.writeFileSync(process.env.BENCH_OUTPUT_MD, benchmarkCollector.toPrettyString());
    } else {
      logger.info(`Benchmark Results:${benchmarkCollector.toPrettyString()}`);
    }
  });

  function assertEpochRules(proofCounts: number[], expectedBlocks: number, expectedTransactionsPerBlock: number): void {
    // Create a map of proof types to their counts for easier reference
    const proofTypeCounts = new Map<ProvingRequestType, number>(
      proofCounts
        .map((count, index): [ProvingRequestType, number] => [PROOF_TYPES_IN_PRIORITY_ORDER[index], count])
        .filter(([_, count]) => count > 0),
    );

    const totalTransactions = expectedBlocks * expectedTransactionsPerBlock;
    const totalBaseRollup =
      (proofTypeCounts.get(ProvingRequestType.PRIVATE_BASE_ROLLUP) ?? 0) +
      (proofTypeCounts.get(ProvingRequestType.PUBLIC_BASE_ROLLUP) ?? 0);

    // Per-block rules (scaled by number of blocks)
    expect(proofTypeCounts.get(ProvingRequestType.BASE_PARITY) ?? 0).toBe(4 * expectedBlocks); // 4 base parity jobs per block
    expect(proofTypeCounts.get(ProvingRequestType.ROOT_PARITY) ?? 0).toBe(1 * expectedBlocks); // 1 root parity job per block
    expect(proofTypeCounts.get(ProvingRequestType.BLOCK_ROOT_ROLLUP) ?? 0).toBe(1 * expectedBlocks); // 1 block root per block
    expect(proofTypeCounts.get(ProvingRequestType.TUBE_PROOF) ?? 0).toBe(totalTransactions); // n tube proofs per block
    expect(totalBaseRollup).toBe(totalTransactions); // n base rollup jobs per block
    expect(proofTypeCounts.get(ProvingRequestType.PUBLIC_VM) ?? 0).toBe(
      proofTypeCounts.get(ProvingRequestType.PUBLIC_BASE_ROLLUP) ?? 0,
    ); // 1 AVM job per public base rollup

    // Merge jobs: (n-2) per block when n > 2
    if (expectedTransactionsPerBlock > 2) {
      expect(proofTypeCounts.get(ProvingRequestType.MERGE_ROLLUP) ?? 0).toBe(
        (expectedTransactionsPerBlock - 2) * expectedBlocks,
      );
    } else {
      expect(proofTypeCounts.get(ProvingRequestType.MERGE_ROLLUP) ?? 0).toBe(0);
    }

    // Epoch-level rules
    expect(proofTypeCounts.get(ProvingRequestType.ROOT_ROLLUP) ?? 0).toBe(1); // Exactly 1 root rollup per epoch

    // Block merge jobs: (m-2) when m > 2
    if (expectedBlocks > 2) {
      expect(proofTypeCounts.get(ProvingRequestType.BLOCK_MERGE_ROLLUP) ?? 0).toBe(expectedBlocks - 2);
    } else {
      expect(proofTypeCounts.get(ProvingRequestType.BLOCK_MERGE_ROLLUP) ?? 0).toBe(0);
    }

    expect(proofTypeCounts.get(ProvingRequestType.SINGLE_TX_BLOCK_ROOT_ROLLUP) ?? 0).toBe(0);
    expect(proofTypeCounts.get(ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP) ?? 0).toBe(0);

    expect(proofTypeCounts.get(ProvingRequestType.PRIVATE_BASE_ROLLUP) ?? 0).toBeGreaterThanOrEqual(0);
    expect(proofTypeCounts.get(ProvingRequestType.PUBLIC_BASE_ROLLUP) ?? 0).toBeGreaterThanOrEqual(0);
    expect(totalBaseRollup).toBeGreaterThan(0);
  }

  function getTotalJobsInBroker(broker: ProvingBroker): number {
    let totalJobs = 0;
    for (const proofType of PROOF_TYPES_IN_PRIORITY_ORDER) {
      totalJobs += (broker as any).queues[proofType].length();
    }
    return totalJobs;
  }

  async function getTotalJobsInDatabase(database: KVBrokerDatabase): Promise<number> {
    let totalJobs = 0;
    for await (const [_job, _result] of database.allProvingJobs()) {
      totalJobs++;
    }
    return totalJobs;
  }

  async function benchmarkEnqueueProofDistribution(
    proofCounts: number[],
    epochGenerator: (index: number) => number = () => 1,
  ): Promise<EnqueueBenchmarkResults> {
    const jobs = buildJobList(proofCounts, epochGenerator);
    const preparedJobs = await Promise.all(
      jobs.map(async job => {
        const jobId = makeRandomProvingJobId(job.epochNumber);
        const inputsUri = (await proofStore.saveProofInput(jobId, job.type)) as any;
        return { ...job, jobId, inputsUri } as const;
      }),
    );

    const enqueueLatencies: number[] = [];
    const timer = benchTimer;

    // Enqueue all jobs concurrently and measure individual latencies
    const enqueuePromises: Promise<number>[] = [];
    const enqueueStartTime = timer.ms();
    for (const { jobId, inputsUri, type, epochNumber } of preparedJobs) {
      const enqueueStart = timer.ms();

      const p = broker
        .enqueueProvingJob({
          id: jobId,
          type,
          inputsUri,
          epochNumber,
        })
        .then(() => {
          const enqueueLatency = timer.ms() - enqueueStart;
          return enqueueLatency;
        });

      enqueuePromises.push(p);
    }

    // Wait for all enqueues to be persisted and collect latencies
    const resolvedLatencies = await Promise.all(enqueuePromises);
    const totalEnqueueTime = timer.ms() - enqueueStartTime;
    enqueueLatencies.push(...resolvedLatencies);

    // Compute total enqueue duration and throughput
    const jobsPerSecond = enqueueLatencies.length > 0 ? enqueueLatencies.length / (totalEnqueueTime / 1000) : 0;

    const percentiles = calculatePercentiles(enqueueLatencies);

    return {
      avgEnqueueLatency: enqueueLatencies.reduce((a, b) => a + b, 0) / enqueueLatencies.length,
      medianEnqueueLatency: percentiles.median,
      p90EnqueueLatency: percentiles.p90,
      p95EnqueueLatency: percentiles.p95,
      p99EnqueueLatency: percentiles.p99,
      totalJobs: enqueueLatencies.length,
      totalEnqueueTime,
      jobsPerSecond,
    };
  }

  async function benchmarkDequeueProofDistribution(
    proofCounts: number[],
    epochGenerator: (index: number) => number = () => 1,
    agentCount: number = 1,
  ): Promise<DequeueBenchmarkResults> {
    const jobs = buildJobList(proofCounts, epochGenerator);
    await Promise.all(
      jobs.map(async ({ type, epochNumber }) => {
        const jobId = makeRandomProvingJobId(epochNumber);
        const inputsUri = (await proofStore.saveProofInput(jobId, type)) as any;
        await broker.enqueueProvingJob({ id: jobId, type, inputsUri, epochNumber });
      }),
    );

    // Now benchmark concurrent dequeuing (simulating multiple agents)
    const dequeueLatencies: number[] = [];
    let totalJobsDequeued = 0;
    const timer = benchTimer;
    const startTime = timer.ms();

    // Create concurrent agent simulators
    const agentPromises = Array.from({ length: agentCount }, async (_, agentId) => {
      const agentLatencies: number[] = [];
      let agentJobCount = 0;

      while (true) {
        const dequeueStart = timer.ms();
        const result = await broker.getProvingJob();
        const dequeueLatency = timer.ms() - dequeueStart;

        if (!result) {
          // No more jobs available
          break;
        }

        agentLatencies.push(dequeueLatency);
        agentJobCount++;
      }

      return { agentId, latencies: agentLatencies, jobCount: agentJobCount };
    });

    // Wait for all agents to finish dequeuing
    const agentResults = await Promise.all(agentPromises);
    const queueEmptyTime = timer.ms() - startTime;

    // Aggregate results from all agents
    agentResults.forEach(({ latencies, jobCount }) => {
      dequeueLatencies.push(...latencies);
      totalJobsDequeued += jobCount;
    });
    const jobsPerSecond = totalJobsDequeued / (queueEmptyTime / 1000);
    const percentiles = calculatePercentiles(dequeueLatencies);

    return {
      avgDequeueLatency:
        dequeueLatencies.length > 0 ? dequeueLatencies.reduce((a, b) => a + b, 0) / dequeueLatencies.length : 0,
      medianDequeueLatency: percentiles.median,
      p90DequeueLatency: percentiles.p90,
      p95DequeueLatency: percentiles.p95,
      p99DequeueLatency: percentiles.p99,
      totalJobs: totalJobsDequeued,
      jobsPerSecond,
      queueEmptyTime,
    };
  }

  async function benchmarkInitializationFromDB(proofCounts: number[]): Promise<InitializationBenchmarkResults> {
    const jobs = buildJobList(proofCounts, () => 1);
    const preparedJobs = await Promise.all(
      jobs.map(async job => {
        const jobId = makeRandomProvingJobId(job.epochNumber);
        const inputsUri = (await proofStore.saveProofInput(jobId, job.type)) as any;
        return { ...job, jobId, inputsUri } as const;
      }),
    );

    const enqueuePromises = [];
    for (const { jobId, inputsUri, type, epochNumber } of preparedJobs) {
      const p = broker.enqueueProvingJob({
        id: jobId,
        type,
        inputsUri,
        epochNumber,
      });
      enqueuePromises.push(p);
    }

    await Promise.all(enqueuePromises);

    const totalJobs = preparedJobs.length;

    // Stop the broker and database to simulate a shutdown
    await broker.stop();
    await databaseHandle.close();

    // Start timer and restart the database and broker from the same directory
    const timer = benchTimer;
    const initStart = timer.ms();

    databaseHandle = await KVBrokerDatabase.new({
      ...defaultProverBrokerConfig,
      dataDirectory: tempDirectory,
      l1Contracts: l1Contracts,
    });

    // Create new broker instance and measure startup time
    broker = new ProvingBroker(databaseHandle);
    await broker.start();

    const initializationTime = timer.ms() - initStart;
    const jobsPerSecond = totalJobs > 0 ? totalJobs / (initializationTime / 1000) : 0;
    const jobsBeforeCleanup = await getTotalJobsInDatabase(databaseHandle);

    // Cleanup runtime with no deletions
    const cleanupStart = timer.ms();
    await (broker as any).cleanupPass();
    const emptyCleanupTime = timer.ms() - cleanupStart;

    // Force full cleanup by enqueuing a job with epoch 3
    const fullCleanupJobId = makeRandomProvingJobId(3);
    const fullCleanupInputsUri = (await proofStore.saveProofInput(
      fullCleanupJobId,
      ProvingRequestType.PRIVATE_BASE_ROLLUP,
    )) as any;
    await broker.enqueueProvingJob({
      id: fullCleanupJobId,
      type: ProvingRequestType.PRIVATE_BASE_ROLLUP,
      inputsUri: fullCleanupInputsUri,
      epochNumber: 3,
    });

    // Cleanup runtime with full epoch deletion
    const fullCleanupStart = timer.ms();
    await (broker as any).cleanupPass();
    const fullCleanupTime = timer.ms() - fullCleanupStart;

    const jobsAfterCleanup = (await getTotalJobsInDatabase(databaseHandle)) - 1; // Disregard the proving job with epoch 3
    const jobsRemovedByCleanup = jobsBeforeCleanup - jobsAfterCleanup;

    return {
      initializationTime,
      totalJobs,
      jobsPerSecond,
      emptyCleanupTime,
      jobsRemovedByCleanup,
      fullCleanupTime,
    };
  }

  // Validate epoch configurations against the rules
  it('validate epoch configurations follow the rules', () => {
    assertEpochRules(proofDistributionTestCases.find(tc => tc.name === 'minimum epoch')!.proofCounts, 1, 8);
    assertEpochRules(proofDistributionTestCases.find(tc => tc.name === 'small epoch')!.proofCounts, 6, 8);
    assertEpochRules(proofDistributionTestCases.find(tc => tc.name === 'medium epoch')!.proofCounts, 20, 20);
    assertEpochRules(proofDistributionTestCases.find(tc => tc.name === 'large epoch')!.proofCounts, 32, 200);
    assertEpochRules(proofDistributionTestCases.find(tc => tc.name === 'maximum epoch')!.proofCounts, 32, 400);
  });

  const combinedTestCases = proofDistributionTestCases.flatMap(proofCase =>
    epochPatterns.map(pattern => ({
      name: `${proofCase.name} with ${pattern.name}`,
      description: proofCase.description,
      proofCounts: proofCase.proofCounts,
      epochGenerator: pattern.generator,
      patternName: pattern.name,
    })),
  );

  it.each(combinedTestCases)(
    'enqueue $name proofs',
    async ({ description: _description, proofCounts, epochGenerator, patternName }) => {
      const results = await benchmarkEnqueueProofDistribution(proofCounts, epochGenerator);

      // Collect benchmark data
      const testName = `${_description.replace(' ', '_')}_${patternName.replace(' ', '_')}`;
      benchmarkCollector.addEnqueueResult(testName, results);

      expect(results.avgEnqueueLatency).toBeGreaterThan(0);

      // Verify total jobs enqueued matches expected count
      const expectedJobs = proofCounts.reduce((sum, count) => sum + count, 0);
      expect(results.totalJobs).toBe(expectedJobs);

      // Verify that the broker has the correct number of jobs in its queues
      const jobsInBroker = getTotalJobsInBroker(broker);
      expect(jobsInBroker).toBe(expectedJobs);
    },
  );

  const dequeueTestCases = proofDistributionTestCases
    .filter(tc => ['minimum epoch', 'small epoch', 'medium epoch', 'large epoch', 'maximum epoch'].includes(tc.name))
    .flatMap(testCase =>
      agentCounts.map(agentCount => ({
        epochName: testCase.name,
        description: testCase.description,
        proofCounts: testCase.proofCounts,
        agentCount,
        testName: `${testCase.name.replace(' ', '_')}_${agentCount}agents`,
      })),
    );

  it.each(dequeueTestCases)(
    'dequeue $epochName proofs ($agentCount agents)',
    async ({ proofCounts, agentCount, testName }) => {
      const results = await benchmarkDequeueProofDistribution(proofCounts, () => 1, agentCount);

      // Collect benchmark data
      benchmarkCollector.addDequeueResult(testName, results, agentCount);

      expect(results.totalJobs).toBeGreaterThan(0);
      expect(results.avgDequeueLatency).toBeGreaterThan(0);
      expect(results.jobsPerSecond).toBeGreaterThan(0);

      // Verify total jobs dequeued matches expected count
      const expectedJobs = proofCounts.reduce((sum, count) => sum + count, 0);
      expect(results.totalJobs).toBe(expectedJobs);
    },
  );

  // Initialization benchmark test cases - using existing epoch configurations
  const initializationTestCases = proofDistributionTestCases.map(testCase => ({
    epochName: testCase.name,
    description: testCase.description,
    proofCounts: testCase.proofCounts,
    testName: testCase.name.replace(/\s+/g, '_'),
  }));

  it.each(initializationTestCases)(
    'initialization $epochName proofs and cleanup on empty and full $epochName proofs',
    async ({ description: _description, proofCounts, testName }) => {
      // Run the initialization benchmark
      const results = await benchmarkInitializationFromDB(proofCounts);

      // Collect benchmark data
      benchmarkCollector.addInitializationResult(testName, results);

      expect(results.initializationTime).toBeGreaterThan(0);
      expect(results.totalJobs).toBeGreaterThan(0);
      expect(results.jobsPerSecond).toBeGreaterThan(0);

      // Verify total jobs dequeued matches expected count
      const expectedJobs = proofCounts.reduce((sum, count) => sum + count, 0);
      expect(results.jobsRemovedByCleanup).toBe(expectedJobs);
    },
  );
});
