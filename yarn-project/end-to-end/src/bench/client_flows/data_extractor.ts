import type { Logger } from '@aztec/aztec.js';
import { BBNativePrivateKernelProver } from '@aztec/bb-prover/client/native';
import { BBWASMBundlePrivateKernelProver } from '@aztec/bb-prover/client/wasm/bundle';
import { createLogger, logger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { WASMSimulator } from '@aztec/simulator/client';
import type { PrivateExecutionStep } from '@aztec/stdlib/kernel';

import { Decoder } from 'msgpackr';
import assert from 'node:assert';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

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

type Step = { fnName: string; gateCount: number; accGateCount?: number };

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

function getMinimumTrace(logs: Log[]): StructuredTrace {
  const minimumMessage = 'Trace details:';
  const minimumMessageIndex = logs.findIndex(log => log.message.includes(minimumMessage));
  const candidateLogs = logs.slice(minimumMessageIndex - GATE_TYPES.length, minimumMessageIndex);

  const traceLogs = candidateLogs
    .filter(log => GATE_TYPES.some(type => log.message.includes(type)))
    .map(log => log.message.split(/\t|\n/))
    .flat()
    .map(log => log.replace(/\(mem: .*\)/, '').trim())
    .filter(Boolean);

  const traceSizes = traceLogs.map(log => {
    const [gateType, gateSizeStr] = log
      .replace(/\n.*\)$/, '')
      .replace(/bb - /, '')
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
      syncTime: number;
      steps: {
        fnName: string;
        gateCount: number;
        timings: { witgen: number; gateCount: number };
      }[];
    };
    const privateExecutionSteps: PrivateExecutionStep[] = profile.steps.map((step, i) => ({
      functionName: step.fnName,
      gateCount: step.gateCount,
      bytecode: stepsFromFile[i].bytecode,
      // TODO(AD) do we still want to take this from witness.json?
      witness: witnessStack[i],
      vk: stepsFromFile[i].vk,
      timings: {
        witgen: step.timings.witgen,
        gateCount: step.timings.witgen,
      },
    }));
    let stats: { duration: number; eventName: string; proofSize: number } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let error: any | undefined;
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

    if (!error) {
      stats = currentLogs[0].data as { duration: number; eventName: string; proofSize: number };
    }

    const minimumTrace = getMinimumTrace(currentLogs);

    const steps = profile.steps.reduce<Step[]>((acc, step, i) => {
      const previousAccGateCount = i === 0 ? 0 : acc[i - 1].accGateCount!;
      return [
        ...acc,
        {
          fnName: step.fnName,
          gateCount: step.gateCount,
          accGateCount: previousAccGateCount + step.gateCount,
          timings: {
            witgen: step.timings.witgen,
          },
        },
      ];
    }, []);
    const totalGateCount = steps[steps.length - 1].accGateCount;
    const benchmark = {
      syncTime: profile.syncTime,
      provingTime,
      proverType,
      minimumTrace: minimumTrace,
      totalGateCount,
      stats,
      steps,
      error,
    };
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
