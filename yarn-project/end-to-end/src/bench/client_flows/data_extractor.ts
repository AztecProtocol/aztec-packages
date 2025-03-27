import type { Logger } from '@aztec/aztec.js';
import { BBNativePrivateKernelProver } from '@aztec/bb-prover';
import { BBWASMBundlePrivateKernelProver } from '@aztec/bb-prover/wasm/bundle';
import { createLogger, logger } from '@aztec/foundation/log';
import type { WitnessMap } from '@aztec/noir-types';
import { WASMSimulator } from '@aztec/simulator/client';
import type { PrivateExecutionStep } from '@aztec/stdlib/kernel';

import { decode } from '@msgpack/msgpack';
import assert from 'node:assert';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { number } from 'zod';

const logLevel = ['silent', 'fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'trace'] as const;
type LogLevel = (typeof logLevel)[number];

type Log = {
  type: LogLevel;
  timestamp: number;
  prefix: string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};

const GATE_TYPES = [
  'ecc_op',
  'busread',
  'lookup',
  'pub_inputs',
  'arithmetic',
  'delta_range',
  'elliptic',
  'aux',
  'poseidon2_external',
  'poseidon2_internal',
  'overflow',
] as const;

type GateType = (typeof GATE_TYPES)[number];

type StructuredTrace = {
  [k in GateType]: number;
};

export class ProxyLogger {
  private static instance: ProxyLogger;
  private logs: Log[] = [];

  private constructor() {}

  static create() {
    ProxyLogger.instance = new ProxyLogger();
  }

  static getInstance() {
    return ProxyLogger.instance;
  }

  createLogger(prefix: string): Logger {
    return new Proxy(createLogger(prefix), {
      get: (target: Logger, prop: keyof Logger) => {
        if (logLevel.includes(prop as (typeof logLevel)[number])) {
          return function (this: Logger, ...data: Parameters<Logger[LogLevel]>) {
            const loggingFn = prop as LogLevel;
            const args = [loggingFn, prefix, ...data] as Parameters<ProxyLogger['handleLog']>;
            ProxyLogger.getInstance().handleLog(...args);
            target[loggingFn].call(this, ...[data[0], data[1]]);
          };
        } else {
          return target[prop];
        }
      },
    });
  }

  private handleLog(type: (typeof logLevel)[number], prefix: string, message: string, data: any) {
    this.logs.unshift({ type, prefix, message, data, timestamp: Date.now() });
  }

  public flushLogs() {
    this.logs = [];
  }

  public getLogs() {
    return this.logs;
  }
}

type NativeProverConfig = { bbBinaryPath?: string; bbWorkingDirectory?: string };

type ProverType = 'wasm' | 'native';

async function createProver(config: NativeProverConfig = {}, log: Logger) {
  const simulationProvider = new WASMSimulator();
  if (!config.bbBinaryPath || !config.bbWorkingDirectory) {
    return { prover: new BBWASMBundlePrivateKernelProver(simulationProvider, 16, log), type: 'wasm' as ProverType };
  } else {
    const bbConfig = config as Required<NativeProverConfig>;
    return {
      prover: await BBNativePrivateKernelProver.new({ bbSkipCleanup: false, ...bbConfig }, simulationProvider, log),
      type: 'native' as ProverType,
    };
  }
}

function getMinimumTrace(logs: Log[]) {
  const minimumMessage = 'Minimum required block sizes for structured trace:';
  const minimumMessageIndex = logs.findIndex(log => log.message.includes(minimumMessage));
  const traceLogs = logs.slice(minimumMessageIndex - GATE_TYPES.length, minimumMessageIndex).reverse();
  const traceSizes = traceLogs.map(log => {
    const [gateType, gateSizeStr] = log.message
      .replace(/\n.*\)$/, '')
      .split(':')
      .map(s => s.trim());
    const gateSize = parseInt(gateSizeStr);
    assert(GATE_TYPES.includes(gateType as GateType), `Gate type ${gateType} is not recognized`);
    return { [gateType]: gateSize };
  });
  assert(traceSizes.length === GATE_TYPES.length, 'Decoded trace sizes do not match expected amount of gate types');
  return traceSizes.reduce((acc, curr) => ({ ...acc, ...curr }), {}) as StructuredTrace;
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

  for (const flow of flows) {
    logger.info(`Processing flow ${flow}`);
    const bytecode = await readFile(join(ivcFolder, flow, 'acir.msgpack'));
    const acirStack = decode(bytecode) as Buffer[];
    const witnesses = await readFile(join(ivcFolder, flow, 'witnesses.json'));
    const witnessStack = JSON.parse(witnesses.toString()).map((witnessMap: Record<string, string>) => {
      return new Map<number, string>(Object.entries(witnessMap).map(([k, v]) => [Number(k), v]));
    });
    const stepsFile = await readFile(join(ivcFolder, flow, 'steps.json'));
    const executionSteps = JSON.parse(stepsFile.toString()) as { fnName: string; gateCount: number }[];
    const privateExecutionSteps: PrivateExecutionStep[] = executionSteps.map((step, i) => ({
      functionName: step.fnName,
      gateCount: step.gateCount,
      bytecode: acirStack[i],
      witness: witnessStack[i],
    }));
    await prover.createClientIvcProof(privateExecutionSteps);
    const currentLogs = proxyLogger.getLogs();
    await writeFile(join(ivcFolder, flow, 'logs.json'), JSON.stringify(currentLogs, null, 2));
    const minimumTrace = getMinimumTrace(currentLogs);
    const stats = currentLogs[0].data as { duration: number; eventName: string; proofSize: number };
    const steps = executionSteps.map((step, i) => {
      const previousStepGateCount = i > 0 ? executionSteps[i - 1].gateCount : 0;
      return { fnName: step.fnName, gateCount: step.gateCount, accGateCount: previousStepGateCount + step.gateCount };
    });
    const totalGateCount = steps[steps.length - 1].accGateCount;
    const benchmark = {
      proverType,
      minimumTrace,
      totalGateCount,
      duration: stats.duration,
      proofSize: stats.proofSize,
      steps,
    };
    await writeFile(join(ivcFolder, flow, 'benchmark.json'), JSON.stringify(benchmark, null, 2));
    proxyLogger.flushLogs();
  }
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
