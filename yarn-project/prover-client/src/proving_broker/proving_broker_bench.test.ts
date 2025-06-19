import { times } from '@aztec/foundation/collection';
import { Timer } from '@aztec/foundation/timer';
import { ProvingRequestType } from '@aztec/stdlib/proofs';
import {
  makeAvmCircuitInputs,
  makeBaseParityInputs,
  makeBlockMergeRollupInputs,
  makeBlockRootRollupInputs,
  makeEmptyBlockRootRollupInputs,
  makeMergeRollupInputs,
  makePrivateBaseRollupInputs,
  makePublicBaseRollupInputs,
  makeRootParityInputs,
  makeRootRollupInputs,
  makeSingleTxBlockRootRollupInputs,
} from '@aztec/stdlib/testing';

import { jest } from '@jest/globals';

import { MockProofStore } from '../test/mock_database.js';
import { MockProver } from '../test/mock_prover.js';
import { makeRandomProvingJobId } from './fixtures.js';
import { ProvingBroker } from './proving_broker.js';
import { InMemoryBrokerDatabase } from './proving_broker_database/memory.js';

jest.setTimeout(300_000);

const BROKER_PRIORITY_ORDER: ProvingRequestType[] = [
  ProvingRequestType.BLOCK_ROOT_ROLLUP,
  ProvingRequestType.SINGLE_TX_BLOCK_ROOT_ROLLUP,
  ProvingRequestType.BLOCK_MERGE_ROLLUP,
  ProvingRequestType.ROOT_ROLLUP,
  ProvingRequestType.MERGE_ROLLUP,
  ProvingRequestType.PUBLIC_BASE_ROLLUP,
  ProvingRequestType.PRIVATE_BASE_ROLLUP,
  ProvingRequestType.PUBLIC_VM,
  ProvingRequestType.TUBE_PROOF,
  ProvingRequestType.ROOT_PARITY,
  ProvingRequestType.BASE_PARITY,
  ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP,
];

interface BenchmarkResults {
  avgEnqueueLatency: number;
}

interface DequeueBenchmarkResults {
  avgDequeueLatency: number;
  totalJobs: number;
  jobsPerSecond: number;
  queueEmptyTime: number;
}

interface GithubActionBenchmarkResult {
  name: string;
  value: number;
  unit: string;
  extra?: string;
}

class ProvingBrokerBenchmarkCollector {
  private results: GithubActionBenchmarkResult[] = [];

  addEnqueueResult(testName: string, avgLatency: number) {
    this.results.push({
      name: `proving_broker/enqueue/${testName}/avg_latency`,
      value: avgLatency,
      unit: 'ms',
    });
  }

  addDequeueResult(testName: string, results: DequeueBenchmarkResults) {
    this.results.push({
      name: `proving_broker/dequeue/${testName}/queue_empty_time`,
      value: results.queueEmptyTime,
      unit: 'ms',
    });
  }

  toPrettyString(): string {
    let output = '\nProving Broker Benchmark Results:\n';
    output += '='.repeat(50) + '\n';

    const enqueueResults = this.results.filter(r => r.name.includes('/enqueue/'));
    const dequeueResults = this.results.filter(r => r.name.includes('/dequeue/'));

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
  let _prover: MockProver;
  let proofStore: MockProofStore;

  const benchmarkCollector = new ProvingBrokerBenchmarkCollector();

  beforeEach(async () => {
    // Initialize the broker with in-memory database
    const database = new InMemoryBrokerDatabase();
    broker = new ProvingBroker(database, {
      proverBrokerJobTimeoutMs: 30_000,
      proverBrokerPollIntervalMs: 1_000,
      proverBrokerJobMaxRetries: 3,
      proverBrokerMaxEpochsToKeepResultsFor: 1,
    });

    // Initialize the mock prover
    _prover = new MockProver();

    // Initialize the mock proof store for faster benchmarks
    proofStore = new MockProofStore();

    // Start both broker and agent
    await broker.start();
  });

  afterEach(async () => {
    await broker.stop();
  });

  afterAll(async () => {
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
      // Default: output to console
      // eslint-disable-next-line no-console
      console.log(benchmarkCollector.toPrettyString());
    }
  });

  /**
   * Helper function to generate test inputs based on proof type
   * Set USE_MOCK_INPUTS to true for faster benchmarks with minimal data
   */
  function makeTestInputs(type: ProvingRequestType): any {
    const USE_MOCK_INPUTS = false; // Toggle this to use mock database

    if (USE_MOCK_INPUTS) {
      return { mockType: type, mockData: 'minimal' };
    }

    switch (type) {
      case ProvingRequestType.BASE_PARITY:
        return makeBaseParityInputs();
      case ProvingRequestType.ROOT_PARITY:
        return makeRootParityInputs();
      case ProvingRequestType.PRIVATE_BASE_ROLLUP:
        return makePrivateBaseRollupInputs();
      case ProvingRequestType.PUBLIC_BASE_ROLLUP:
        return makePublicBaseRollupInputs();
      case ProvingRequestType.MERGE_ROLLUP:
        return makeMergeRollupInputs();
      case ProvingRequestType.BLOCK_MERGE_ROLLUP:
        return makeBlockMergeRollupInputs();
      case ProvingRequestType.BLOCK_ROOT_ROLLUP:
        return makeBlockRootRollupInputs();
      case ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP:
        return makeEmptyBlockRootRollupInputs();
      case ProvingRequestType.ROOT_ROLLUP:
        return makeRootRollupInputs();
      case ProvingRequestType.SINGLE_TX_BLOCK_ROOT_ROLLUP:
        return makeSingleTxBlockRootRollupInputs();
      case ProvingRequestType.PUBLIC_VM:
        return makeAvmCircuitInputs();
      case ProvingRequestType.TUBE_PROOF:
        return makeBaseParityInputs();
      default:
        return makeBaseParityInputs();
    }
  }

  async function benchmarkEnqueueProofDistribution(
    proofCounts: number[],
    epochGenerator: (index: number) => number = () => 1,
  ): Promise<BenchmarkResults> {
    const jobs: Array<{ type: ProvingRequestType; epochNumber: number }> = [];
    const enqueueLatencies: number[] = [];

    // Generate job list based on counts
    let jobIndex = 0;
    proofCounts.forEach((count, index) => {
      if (count > 0 && index < BROKER_PRIORITY_ORDER.length) {
        const proofType = BROKER_PRIORITY_ORDER[index];
        times(count, () => {
          jobs.push({
            type: proofType,
            epochNumber: epochGenerator(jobIndex++),
          });
        });
      }
    });

    const timer = new Timer();

    // Enqueue all jobs and measure latency
    for (const job of jobs) {
      const inputs = makeTestInputs(job.type);
      const inputsUri = (await proofStore.saveProofInput(makeRandomProvingJobId(), job.type, inputs)) as any;
      const jobId = makeRandomProvingJobId();

      const enqueueStart = timer.ms();
      await broker.enqueueProvingJob({
        id: jobId,
        type: job.type,
        inputsUri,
        epochNumber: job.epochNumber,
      });
      const enqueueLatency = timer.ms() - enqueueStart;
      enqueueLatencies.push(enqueueLatency);
    }

    return {
      avgEnqueueLatency: enqueueLatencies.reduce((a, b) => a + b, 0) / enqueueLatencies.length,
    };
  }

  async function benchmarkDequeueProofDistribution(
    proofCounts: number[],
    epochGenerator: (index: number) => number = () => 1,
  ): Promise<DequeueBenchmarkResults> {
    // First, populate the broker with jobs
    const jobs: Array<{ type: ProvingRequestType; epochNumber: number }> = [];
    let jobIndex = 0;

    proofCounts.forEach((count, index) => {
      if (count > 0 && index < BROKER_PRIORITY_ORDER.length) {
        const proofType = BROKER_PRIORITY_ORDER[index];
        times(count, () => {
          jobs.push({
            type: proofType,
            epochNumber: epochGenerator(jobIndex++),
          });
        });
      }
    });

    // Enqueue all jobs without measuring (setup phase)
    for (const job of jobs) {
      const inputs = makeTestInputs(job.type);
      const inputsUri = (await proofStore.saveProofInput(makeRandomProvingJobId(), job.type, inputs)) as any;
      const jobId = makeRandomProvingJobId();

      await broker.enqueueProvingJob({
        id: jobId,
        type: job.type,
        inputsUri,
        epochNumber: job.epochNumber,
      });
    }

    // Now benchmark dequeuing
    const dequeueLatencies: number[] = [];
    const timer = new Timer();
    const startTime = timer.ms();
    let totalJobsDequeued = 0;

    // Simple poll loop - dequeue all jobs and measure latency
    while (true) {
      const dequeueStart = timer.ms();
      const result = await broker.getProvingJob();
      const dequeueLatency = timer.ms() - dequeueStart;

      if (!result) {
        // No more jobs available
        break;
      }

      dequeueLatencies.push(dequeueLatency);
      totalJobsDequeued++;
    }

    const queueEmptyTime = timer.ms() - startTime;
    const jobsPerSecond = totalJobsDequeued / (queueEmptyTime / 1000);

    return {
      avgDequeueLatency:
        dequeueLatencies.length > 0 ? dequeueLatencies.reduce((a, b) => a + b, 0) / dequeueLatencies.length : 0,
      totalJobs: totalJobsDequeued,
      jobsPerSecond,
      queueEmptyTime,
    };
  }

  const proofDistributionTestCases = [
    {
      name: 'minimum epoch',
      description: '1 block', // 1 transaction
      proofCounts: [0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 4, 0],
    },
    {
      name: 'small epoch',
      description: '6 blocks', // ~8 transactions per block = ~48 total transactions
      proofCounts: [4, 2, 5, 1, 30, 20, 28, 20, 48, 6, 24, 0],
    },

    {
      name: 'medium epoch',
      description: '20 blocks', // ~20 transactions per block = ~400 total transactions
      proofCounts: [18, 1, 19, 1, 300, 160, 240, 160, 400, 20, 80, 1],
    },
    {
      name: 'large epoch',
      description: '35 blocks', // ~25 transactions per block = ~875 total transactions
      proofCounts: [32, 2, 34, 1, 525, 350, 525, 350, 875, 35, 140, 1],
    },
    {
      name: 'maximum epoch',
      description: '48 blocks', // 32 transactions per block = 1,536 total txs
      proofCounts: [48, 0, 47, 1, 912, 768, 768, 768, 1536, 48, 192, 0],
    },
  ];

  const epochPatterns = [
    {
      name: 'single epoch',
      generator: () => 1,
    },
    {
      name: 'random epochs',
      generator: () => {
        const maxEpochsToKeep = 1;
        const epochRange = maxEpochsToKeep + 1;
        return Math.floor(Math.random() * epochRange) + 1;
      },
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

  function createCombinedTestCases(proofCases: typeof proofDistributionTestCases, patterns: typeof epochPatterns) {
    return proofCases.flatMap(proofCase =>
      patterns.map(pattern => ({
        name: `${proofCase.name} with ${pattern.name}`,
        description: proofCase.description,
        proofCounts: proofCase.proofCounts,
        epochGenerator: pattern.generator,
        patternName: pattern.name,
      })),
    );
  }

  const combinedTestCases = createCombinedTestCases(proofDistributionTestCases, epochPatterns);

  it.each(combinedTestCases)(
    'enqueue $name proofs',
    async ({ description: _description, proofCounts, epochGenerator, patternName }) => {
      const results = await benchmarkEnqueueProofDistribution(proofCounts, epochGenerator);

      // Collect benchmark data
      const testName = `${_description.replace(' ', '_')}_${patternName.replace(' ', '_')}`;
      benchmarkCollector.addEnqueueResult(testName, results.avgEnqueueLatency);

      expect(results.avgEnqueueLatency).toBeGreaterThan(0);
      expect(results.avgEnqueueLatency).toBeLessThan(1000); // Should be under 1 second per job
    },
  );

  it.each(proofDistributionTestCases)('dequeue $name proofs', async ({ description: _description, proofCounts }) => {
    const results = await benchmarkDequeueProofDistribution(proofCounts, () => 1);

    // Collect benchmark data
    const testName = _description.replace(' ', '_');
    benchmarkCollector.addDequeueResult(testName, results);

    expect(results.totalJobs).toBeGreaterThan(0);
    expect(results.avgDequeueLatency).toBeGreaterThan(0);
    expect(results.avgDequeueLatency).toBeLessThan(100);
    expect(results.jobsPerSecond).toBeGreaterThan(0);

    const expectedJobs = proofCounts.reduce((sum, count) => sum + count, 0);
    expect(results.totalJobs).toBe(expectedJobs);
  });
});
