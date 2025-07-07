import type { Logger } from '@aztec/aztec.js';
import { BBNativePrivateKernelProver } from '@aztec/bb-prover/client/native';
import { BBWASMBundlePrivateKernelProver } from '@aztec/bb-prover/client/wasm/bundle';
import { createLogger, logger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { WASMSimulator } from '@aztec/simulator/client';
import type { PrivateExecutionStep } from '@aztec/stdlib/kernel';
import type { ProvingStats, ProvingTimings, SimulationStats } from '@aztec/stdlib/tx';

import { Decoder } from 'msgpackr';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Log, type ProverType, ProxyLogger, generateBenchmark } from './benchmark.js';

type NativeProverConfig = { bbBinaryPath?: string; bbWorkingDirectory?: string };

async function createProver(config: NativeProverConfig = {}, log: Logger) {
  const simulator = new WASMSimulator();
  if (!config.bbBinaryPath || !config.bbWorkingDirectory) {
    return { prover: new BBWASMBundlePrivateKernelProver(simulator, 16, log), type: 'wasm' as ProverType };
  } else {
    const bbConfig = config as Required<NativeProverConfig>;
    return {
      prover: await BBNativePrivateKernelProver.new(
        { bbSkipCleanup: false, numConcurrentIVCVerifiers: 1, bbIVCConcurrency: 1, ...bbConfig },
        simulator,
        log,
      ),
      type: 'native' as ProverType,
    };
  }
}

async function main() {
  ProxyLogger.create();
  const proxyLogger = ProxyLogger.getInstance();
  const ivcFolder = process.env.CAPTURE_IVC_FOLDER;
  if (!ivcFolder) {
    throw new Error('CAPTURE_IVC_FOLDER is not set');
  }
  const flows = await readdir(ivcFolder);
  logger.info(`Flows in ${ivcFolder}: \n${flows.map(flowName => `\t- ${flowName}`).join('\n')}`);
  const { prover, type: proverType } = await createProver(
    { bbBinaryPath: process.env.BB_BINARY_PATH, bbWorkingDirectory: process.env.BB_WORKING_DIRECTORY },
    proxyLogger.createLogger('bb:prover'),
  );

  const userLog = createLogger('client_ivc_flows:data_processor');

  for (const flow of flows) {
    userLog.info(`Processing flow ${flow}`);
    const ivcInputs = await readFile(join(ivcFolder, flow, 'ivc-inputs.msgpack'));
    const stepsFromFile: PrivateExecutionStep[] = new Decoder({ useRecords: false }).unpack(ivcInputs);
    const witnesses = await readFile(join(ivcFolder, flow, 'witnesses.json'));

    const witnessStack = JSON.parse(witnesses.toString()).map((witnessMap: Record<string, string>) => {
      return new Map<number, string>(Object.entries(witnessMap).map(([k, v]) => [Number(k), v]));
    });
    const profileFile = await readFile(join(ivcFolder, flow, 'profile.json'));
    const profile = JSON.parse(profileFile.toString()) as {
      stats: ProvingStats | SimulationStats;
      steps: {
        functionName: string;
        gateCount: number;
        timings: { witgen: number; gateCount: number };
      }[];
    };
    const privateExecutionSteps: PrivateExecutionStep[] = profile.steps.map((step, i) => ({
      functionName: step.functionName,
      gateCount: step.gateCount,
      bytecode: stepsFromFile[i].bytecode,
      // TODO(AD) do we still want to take this from witness.json?
      witness: witnessStack[i],
      vk: stepsFromFile[i].vk,
      timings: {
        witgen: step.timings.witgen,
        gateCount: step.timings.gateCount,
      },
    }));

    let error: any;
    let currentLogs: Log[] = [];
    let provingTime;
    try {
      const provingTimer = new Timer();
      await prover.createClientIvcProof(privateExecutionSteps);
      provingTime = provingTimer.ms();
    } catch (e) {
      userLog.error(`Failed to generate client ivc proof for ${flow}`, e);
      error = (e as Error).message;
    }
    // Extract logs from this run from the proxy and write them to disk unconditionally
    currentLogs = proxyLogger.getLogs();
    await writeFile(join(ivcFolder, flow, 'logs.json'), JSON.stringify(currentLogs, null, 2));
    if (!(profile.stats.timings as ProvingTimings).proving) {
      (profile.stats.timings as ProvingTimings).proving = provingTime;
    }
    const benchmark = generateBenchmark(flow, currentLogs, profile.stats, privateExecutionSteps, proverType, error);
    await writeFile(join(ivcFolder, flow, 'benchmark.json'), JSON.stringify(benchmark, null, 2));
    proxyLogger.flushLogs();
  }
}

try {
  await main();
} catch (e) {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
}
