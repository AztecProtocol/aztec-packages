import type { AztecNodeService } from '@aztec/aztec-node';
import { type AztecNode, BatchCall, type SentTx, type WaitOpts } from '@aztec/aztec.js';
import { mean, stdDev, times } from '@aztec/foundation/collection';
import { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import { type PXEService, type PXEServiceConfig, createPXEService } from '@aztec/pxe/server';
import type { MetricsType } from '@aztec/telemetry-client';
import type { BenchmarkDataPoint, BenchmarkMetricsType, BenchmarkTelemetryClient } from '@aztec/telemetry-client/bench';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

import { type EndToEndContext, type SetupOptions, setup } from '../fixtures/utils.js';

/**
 * Setup for benchmarks. Initializes a remote node with a single account and deploys a benchmark contract.
 */
export async function benchmarkSetup(
  opts: Partial<SetupOptions> & {
    /** What metrics to export */ metrics: (MetricsType | MetricFilter)[];
    /** Where to output the benchmark data (defaults to BENCH_OUTPUT or bench.json) */
    benchOutput?: string;
  },
) {
  const context = await setup(1, { ...opts, telemetryConfig: { benchmark: true } });
  const contract = await BenchmarkingContract.deploy(context.wallet).send().deployed();
  context.logger.info(`Deployed benchmarking contract at ${contract.address}`);
  const sequencer = (context.aztecNode as AztecNodeService).getSequencer()!;
  const telemetry = context.telemetryClient! as BenchmarkTelemetryClient;
  context.logger.warn(`Cleared benchmark data points from setup`);
  telemetry.clear();
  const origTeardown = context.teardown.bind(context);
  context.teardown = async () => {
    await telemetry.flush();
    const data = telemetry.getMeters();
    const formatted = formatMetricsForGithubBenchmarkAction(data, opts.metrics);
    if (formatted.length === 0) {
      throw new Error(`No benchmark data generated. Please review your test setup.`);
    }
    const benchOutput = opts.benchOutput ?? process.env.BENCH_OUTPUT ?? 'bench.json';
    mkdirSync(path.dirname(benchOutput), { recursive: true });
    writeFileSync(benchOutput, JSON.stringify(formatted));
    context.logger.info(`Wrote ${data.length} metrics to ${benchOutput}`);
    await origTeardown();
  };
  return { telemetry, context, contract, sequencer };
}

type MetricFilter = {
  source: MetricsType;
  transform: (value: number) => number;
  name: string;
  unit?: string;
};

// See https://github.com/benchmark-action/github-action-benchmark/blob/e3c661617bc6aa55f26ae4457c737a55545a86a4/src/extract.ts#L659-L670
export type GithubActionBenchmarkResult = {
  name: string;
  value: number;
  range?: string;
  unit: string;
  extra?: string;
};

function formatMetricsForGithubBenchmarkAction(
  data: BenchmarkMetricsType,
  filter: (MetricsType | MetricFilter)[],
): GithubActionBenchmarkResult[] {
  const allFilters: MetricFilter[] = filter.map(f =>
    typeof f === 'string' ? { name: f, source: f, transform: (x: number) => x, unit: undefined } : f,
  );
  return data.flatMap(meter => {
    return meter.metrics
      .filter(metric => allFilters.map(f => f.source).includes(metric.name as MetricsType))
      .map(metric => [metric, allFilters.find(f => f.source === metric.name)!] as const)
      .map(([metric, filter]) => ({
        name: `${meter.name}/${filter.name}`,
        unit: filter.unit ?? metric.unit ?? 'unknown',
        ...getMetricValues(metric.points.map(p => ({ ...p, value: filter.transform(p.value) }))),
      }))
      .filter((metric): metric is GithubActionBenchmarkResult => metric.value !== undefined);
  });
}

function getMetricValues(points: BenchmarkDataPoint[]) {
  if (points.length === 0) {
    return {};
  } else if (points.length === 1) {
    return { value: points[0].value };
  } else {
    const values = points.map(point => point.value);
    return { value: mean(values), range: `± ${stdDev(values)}` };
  }
}

/**
 * Returns a call to the benchmark contract. Each call has a private execution (account entrypoint),
 * a nested private call (create_note), a public call (increment_balance), and a nested public
 * call (broadcast). These include emitting one private note and one public log, two storage
 * reads and one write.
 * @param index - Index of the call within a block.
 * @param context - End to end context.
 * @param contract - Benchmarking contract.
 * @param heavyPublicCompute - Whether the transactions include heavy public compute (like a big sha256).
 * @returns A BatchCall instance.
 */
function makeCall(
  index: number,
  context: EndToEndContext,
  contract: BenchmarkingContract,
  heavyPublicCompute: boolean,
) {
  const owner = context.wallet.getAddress();
  const sender = owner;
  if (heavyPublicCompute) {
    return new BatchCall(context.wallet, [contract.methods.sha256_hash_2048(randomBytesAsBigInts(2048))]);
  } else {
    return new BatchCall(context.wallet, [
      contract.methods.create_note(owner, sender, index + 1),
      contract.methods.increment_balance(owner, index + 1),
    ]);
  }
}

/**
 * Assembles and sends multiple transactions simultaneously to the node in context.
 * Each tx is the result of calling makeCall.
 * @param txCount - How many txs to send
 * @param context - End to end context.
 * @param contract - Target contract.
 * @param heavyPublicCompute - Whether the transactions include heavy public compute (like a big sha256).
 * @returns Array of sent txs.
 */
export async function sendTxs(
  txCount: number,
  context: EndToEndContext,
  contract: BenchmarkingContract,
  heavyPublicCompute: boolean = false,
): Promise<SentTx[]> {
  const calls = times(txCount, index => makeCall(index, context, contract, heavyPublicCompute));
  context.logger.info(`Creating ${txCount} txs`);
  const provenTxs = await Promise.all(calls.map(call => call.prove()));
  context.logger.info(`Sending ${txCount} txs`);
  return provenTxs.map(tx => tx.send());
}

export async function waitTxs(txs: SentTx[], context: EndToEndContext, txWaitOpts?: WaitOpts) {
  context.logger.info(`Awaiting ${txs.length} txs to be mined`);
  await Promise.all(txs.map(tx => tx.wait(txWaitOpts)));
  context.logger.info(`All ${txs.length} txs have been mined`);
}

/**
 * Creates a new PXE
 * @param node - Node to connect the pxe to.
 * @param contract - Benchmark contract to add to the pxe.
 * @param startingBlock - First l2 block to process.
 * @returns The new PXE.
 */
export async function createNewPXE(node: AztecNode, contract: BenchmarkingContract): Promise<PXEService> {
  const l1Contracts = await node.getL1ContractAddresses();
  const { l1ChainId, rollupVersion } = await node.getNodeInfo();
  const pxeConfig = {
    l2BlockBatchSize: 50,
    l2BlockPollingIntervalMS: 100,
    dataDirectory: undefined,
    dataStoreMapSizeKB: 1024 * 1024,
    l1Contracts,
    l1ChainId,
    rollupVersion,
  } as PXEServiceConfig;
  // docs:start:PXEcreate
  const pxe = await createPXEService(node, pxeConfig);
  // docs:end:PXEcreate
  await pxe.registerContract(contract);
  return pxe;
}

function randomBytesAsBigInts(length: number): bigint[] {
  return [...Array(length)].map(_ => BigInt(Math.floor(Math.random() * 255)));
}
