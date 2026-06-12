import type { InitialAccountData } from '@aztec/accounts/testing';
import type { AztecNodeService } from '@aztec/aztec-node';
import { getAccountContractAddress } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { BatchCall, NO_WAIT, type WaitOpts } from '@aztec/aztec.js/contracts';
import { Fr } from '@aztec/aztec.js/fields';
import { waitForTx } from '@aztec/aztec.js/node';
import { SlotNumber } from '@aztec/foundation/branded-types';
import { mean, stdDev, times } from '@aztec/foundation/collection';
import { BenchmarkingContract } from '@aztec/noir-test-contracts.js/Benchmarking';
import { type Sequencer, type SequencerEvents, SequencerState } from '@aztec/sequencer-client';
import type { TxHash } from '@aztec/stdlib/tx';
import type { MetricDefinition } from '@aztec/telemetry-client';
import type { BenchmarkDataPoint, BenchmarkMetricsType, BenchmarkTelemetryClient } from '@aztec/telemetry-client/bench';

import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { cornTestnet } from 'viem/chains';

import { PIPELINING_SETUP_OPTS } from '../fixtures/fixtures.js';
import {
  SCHNORR_HARDCODED_PRIVATE_KEY,
  SchnorrHardcodedKeyAccountContract,
} from '../fixtures/schnorr_hardcoded_account_contract.js';
import { type EndToEndContext, type SetupOptions, setup } from '../fixtures/utils.js';

const MAX_BENCH_WAIT_BLOCKS = 6;
const BENCH_FINAL_WAIT_TIMEOUT_SECONDS = 10;
const SEQUENCER_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_L1_PUBLISHING_TIME_SECONDS = 12;

/**
 * Setup for benchmarks. Initializes a remote node with a funded hardcoded account and deploys a benchmark contract.
 */
export async function benchmarkSetup(
  opts: Partial<SetupOptions> & {
    /** What metrics to export */ metrics: (MetricDefinition | MetricFilter)[];
    /** Where to output the benchmark data (defaults to BENCH_OUTPUT or bench.json) */
    benchOutput?: string;
  },
) {
  const context = await setup(1, {
    ...PIPELINING_SETUP_OPTS,
    ...opts,
    telemetryConfig: { benchmark: true },
  });
  const [defaultAccountAddress] = context.accounts;
  const sequencer = getSequencerClient(context);
  await waitForSequencerIdle(sequencer.getSequencer());
  const deployment = BenchmarkingContract.deploy(context.wallet);
  const { txHash } = await deployment.send({ from: defaultAccountAddress, wait: NO_WAIT });
  await waitTxs([txHash], context);
  const contract = await deployment.register();
  context.logger.info(`Deployed benchmarking contract at ${contract.address}`);
  const telemetry = context.telemetryClient as BenchmarkTelemetryClient;
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

async function getBenchmarkAccountData(): Promise<InitialAccountData> {
  const contract = new SchnorrHardcodedKeyAccountContract();
  const secret = Fr.random();
  const salt = Fr.random();
  const address = await getAccountContractAddress(contract, secret, salt);
  return { secret, salt, signingKey: SCHNORR_HARDCODED_PRIVATE_KEY, address };
}

function getSequencerClient(context: EndToEndContext) {
  const sequencer = (context.aztecNode as AztecNodeService).getSequencer();
  if (!sequencer) {
    throw new Error('Benchmark setup requires a local sequencer');
  }
  return sequencer;
}

type MetricFilter = {
  source: MetricDefinition;
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

function isMetricDefinition(f: MetricDefinition | MetricFilter): f is MetricDefinition {
  return 'description' in f;
}

function formatMetricsForGithubBenchmarkAction(
  data: BenchmarkMetricsType,
  filter: (MetricDefinition | MetricFilter)[],
): GithubActionBenchmarkResult[] {
  const allFilters: MetricFilter[] = filter.map(f =>
    isMetricDefinition(f) ? { name: f.name, source: f, transform: (x: number) => x, unit: f.unit } : f,
  );
  return data.flatMap(meter => {
    return meter.metrics
      .filter(metric => allFilters.map(f => f.source.name).includes(metric.name))
      .map(metric => [metric, allFilters.find(f => f.source.name === metric.name)!] as const)
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
async function makeCall(
  index: number,
  context: EndToEndContext,
  contract: BenchmarkingContract,
  heavyPublicCompute: boolean,
) {
  if (heavyPublicCompute) {
    return new BatchCall(context.wallet, [contract.methods.sha256_hash_1024(randomBytesAsBigInts(1024))]);
  } else {
    // We use random address for the new note owner because we can emit at most UNFINALIZED_TAGGING_INDEXES_WINDOW_LEN
    // logs for a given sender-recipient-contract tuple.
    const ownerOfNewNote = await AztecAddress.random();
    const [ownerOfBalance] = context.accounts;
    return new BatchCall(context.wallet, [
      contract.methods.create_note(ownerOfNewNote, index + 1),
      contract.methods.increment_balance(ownerOfBalance, index + 1),
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
): Promise<TxHash[]> {
  const calls = await Promise.all(times(txCount, index => makeCall(index, context, contract, heavyPublicCompute)));
  context.logger.info(`Creating ${txCount} txs`);
  const [from] = context.accounts;
  context.logger.info(`Sending ${txCount} txs`);
  return Promise.all(
    calls.map(async call => {
      const { txHash } = await call.send({ from, wait: NO_WAIT });
      return txHash;
    }),
  );
}

export async function waitTxs(txs: TxHash[], context: EndToEndContext, txWaitOpts?: WaitOpts) {
  context.logger.info(`Awaiting ${txs.length} txs to be mined`);
  await waitTxsWithBlockMining(txs, context, txWaitOpts);
  context.logger.info(`${txs.length} txs have been mined`);
}

async function waitTxsWithBlockMining(txs: TxHash[], context: EndToEndContext, txWaitOpts?: WaitOpts) {
  const sequencer = getSequencerClient(context).getSequencer();
  for (let attempt = 0; attempt <= MAX_BENCH_WAIT_BLOCKS; attempt++) {
    if (await haveAllTxsMined(txs, context, txWaitOpts)) {
      await waitForSequencerIdle(sequencer);
      return;
    }
    await waitForSequencerIdle(sequencer);
    context.logger.info('Mining next benchmark block while waiting for txs', {
      attempt,
      txs: txs.length,
    });
    await mineNextBenchmarkBlock(context, sequencer);
  }
  await Promise.all(
    txs.map(txHash =>
      waitForTx(context.aztecNode, txHash, {
        ...txWaitOpts,
        timeout: txWaitOpts?.timeout ?? BENCH_FINAL_WAIT_TIMEOUT_SECONDS,
      }),
    ),
  );
}

async function haveAllTxsMined(txs: TxHash[], context: EndToEndContext, txWaitOpts?: WaitOpts): Promise<boolean> {
  const receipts = await Promise.all(txs.map(txHash => context.aztecNode.getTxReceipt(txHash)));
  for (const receipt of receipts) {
    if (receipt.isDropped()) {
      throw new Error(`Transaction ${receipt.txHash.toString()} was dropped. Reason: ${receipt.error ?? 'unknown'}`);
    }
    if (!receipt.isMined()) {
      return false;
    }
    if (!receipt.hasExecutionSucceeded() && !txWaitOpts?.dontThrowOnRevert) {
      throw new Error(
        `Transaction ${receipt.txHash.toString()} reverted: ${receipt.executionResult}. Reason: ${
          receipt.error ?? 'unknown'
        }`,
      );
    }
  }
  return true;
}

async function mineNextBenchmarkBlock(context: EndToEndContext, sequencer: Sequencer) {
  const l1PublishingTime = BigInt(context.config.l1PublishingTime ?? DEFAULT_L1_PUBLISHING_TIME_SECONDS);
  const currentTimestamp = BigInt(await context.cheatCodes.eth.lastBlockTimestamp());
  let targetSlot = SlotNumber((await context.cheatCodes.rollup.getSlot()) + 1);
  let targetTimestamp = await context.cheatCodes.rollup.getTimestampForSlot(targetSlot);
  while (targetTimestamp - l1PublishingTime - 1n <= currentTimestamp) {
    targetSlot = SlotNumber(targetSlot + 1);
    targetTimestamp = await context.cheatCodes.rollup.getTimestampForSlot(targetSlot);
  }

  const triggerTimestamp = targetTimestamp - l1PublishingTime - 1n;
  await context.cheatCodes.eth.warp(triggerTimestamp, { resetBlockInterval: true });
  await context.aztecNode.mineBlock();
  await waitForSequencerIdle(sequencer);
}

function waitForSequencerIdle(sequencer: Sequencer, timeout = SEQUENCER_IDLE_TIMEOUT_MS): Promise<void> {
  if (sequencer.status().state === SequencerState.IDLE) {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      sequencer.off('state-changed', handler);
      reject(new Error('Timeout waiting for sequencer IDLE state'));
    }, timeout);
    const handler = (args: Parameters<SequencerEvents['state-changed']>[0]) => {
      if (args.newState === SequencerState.IDLE) {
        clearTimeout(timer);
        sequencer.off('state-changed', handler);
        resolve();
      }
    };
    sequencer.on('state-changed', handler);
  });
}

function randomBytesAsBigInts(length: number): bigint[] {
  return [...Array(length)].map(_ => BigInt(Math.floor(Math.random() * 255)));
}
