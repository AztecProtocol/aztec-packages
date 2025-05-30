import type {
  ContractFunctionInteraction,
  DeployMethod,
  DeployOptions,
  Logger,
  ProfileMethodOptions,
} from '@aztec/aztec.js';
import { createLogger } from '@aztec/foundation/log';
import { type PrivateExecutionStep, serializePrivateExecutionSteps } from '@aztec/stdlib/kernel';
import type { ProvingStats, ProvingTimings, SimulationStats, SimulationTimings } from '@aztec/stdlib/tx';

import assert from 'node:assert';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { GithubActionBenchmarkResult } from '../utils.js';

const logger = createLogger('bench:profile_capture');

const logLevel = ['silent', 'fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'trace'] as const;
type LogLevel = (typeof logLevel)[number];

export type Log = {
  type: LogLevel;
  timestamp: number;
  prefix: string;
  message: string;
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

export type ProverType = 'wasm' | 'native';

type CallRecording = {
  // Number of times the function has been called
  calls: number;
  // Maximum time taken by the function (in ms)
  max: number;
  // Minimum time taken by the function (in ms)
  min: number;
  // Average time taken by the function (in ms)
  avg: number;
  // Total time spent in the function, computed as sum of all calls (in ms)
  total: number;
};

type Step = Pick<PrivateExecutionStep, 'functionName' | 'gateCount'> & {
  time: number;
  accGateCount?: number;
  oracles: Record<string, CallRecording>;
};

type ClientFlowBenchmark = {
  name: string;
  timings: Omit<ProvingTimings & SimulationTimings, 'perFunction'> & { witgen: number };
  maxMemory: number;
  rpc: Record<string, CallRecording>;
  proverType: ProverType;
  minimumTrace: StructuredTrace;
  totalGateCount: number;
  steps: Step[];
  error: string | undefined;
};

function getMinimumTrace(logs: Log[]): StructuredTrace {
  const minimumMessage = 'Minimum required block sizes for structured trace';
  const minimumMessageIndex = logs.findIndex(log => log.message.includes(minimumMessage));
  const candidateLogs = logs.slice(minimumMessageIndex - GATE_TYPES.length, minimumMessageIndex + 5);

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

function getMaxMemory(logs: Log[]): number {
  const candidateLogs = logs.slice(0, 100).filter(log => /\(mem: .*MiB\)/.test(log.message));
  const usage = candidateLogs.map(log => {
    const memStr = log ? log.message.slice(log.message.indexOf('(mem: ') + 6, log.message.indexOf('MiB') - 3) : '';
    return memStr ? parseInt(memStr) : 0;
  });
  return Math.max(...usage);
}

export function generateBenchmark(
  flow: string,
  logs: Log[],
  stats: ProvingStats | SimulationStats,
  privateExecutionSteps: PrivateExecutionStep[],
  proverType: ProverType,
  error: string | undefined,
): ClientFlowBenchmark {
  let maxMemory = 0;
  let minimumTrace: StructuredTrace;
  try {
    minimumTrace = getMinimumTrace(logs);
    maxMemory = getMaxMemory(logs);
  } catch {
    logger.warn(`Failed obtain minimum trace and max memory for ${flow}. Did you run with REAL_PROOFS=1?`);
  }

  const steps = privateExecutionSteps.reduce<Step[]>((acc, step, i) => {
    const previousAccGateCount = i === 0 ? 0 : acc[i - 1].accGateCount!;
    return [
      ...acc,
      {
        functionName: step.functionName,
        gateCount: step.gateCount,
        accGateCount: previousAccGateCount + step.gateCount!,
        time: step.timings.witgen,
        oracles: Object.entries(step.timings.oracles ?? {}).reduce(
          (acc, [oracleName, oracleData]) => {
            const total = oracleData.times.reduce((sum, time) => sum + time, 0);
            const calls = oracleData.times.length;
            acc[oracleName] = {
              calls,
              max: Math.max(...oracleData.times),
              min: Math.min(...oracleData.times),
              total,
              avg: total / calls,
            };
            return acc;
          },
          {} as Record<string, CallRecording>,
        ),
      },
    ];
  }, []);
  const timings = stats.timings;
  const totalGateCount = steps[steps.length - 1].accGateCount;
  return {
    name: flow,
    timings: {
      total: timings.total,
      sync: timings.sync!,
      proving: (timings as ProvingTimings).proving,
      unaccounted: timings.unaccounted,
      witgen: timings.perFunction.reduce((acc, fn) => acc + fn.time, 0),
    },
    rpc: Object.entries(stats.nodeRPCCalls ?? {}).reduce(
      (acc, [RPCName, RPCCalls]) => {
        const total = RPCCalls.times.reduce((sum, time) => sum + time, 0);
        const calls = RPCCalls.times.length;
        acc[RPCName] = {
          calls,
          max: Math.max(...RPCCalls.times),
          min: Math.min(...RPCCalls.times),
          total,
          avg: total / calls,
        };
        return acc;
      },
      {} as Record<string, CallRecording>,
    ),
    maxMemory,
    proverType,
    minimumTrace: minimumTrace!,
    totalGateCount: totalGateCount!,
    steps,
    error,
  };
}

export function convertProfileToGHBenchmark(benchmark: ClientFlowBenchmark): GithubActionBenchmarkResult[] {
  const totalRPCCalls = Object.values(benchmark.rpc).reduce((acc, call) => acc + call.calls, 0);
  const benches = [
    {
      name: `${benchmark.name}/witgen`,
      value: benchmark.timings.witgen,
      unit: 'ms',
    },

    {
      name: `${benchmark.name}/total`,
      value: benchmark.timings.total,
      unit: 'ms',
    },
    {
      name: `${benchmark.name}/sync`,
      value: benchmark.timings.sync!,
      unit: 'ms',
    },
    {
      name: `${benchmark.name}/unaccounted`,
      value: benchmark.timings.unaccounted,
      unit: 'ms',
    },

    {
      name: `${benchmark.name}/total_gate_count`,
      value: benchmark.totalGateCount,
      unit: 'gates',
    },
    {
      name: `${benchmark.name}/rpc`,
      value: totalRPCCalls,
      unit: 'calls',
    },
  ];
  if (benchmark.timings.proving) {
    benches.push({
      name: `${benchmark.name}/proving`,
      value: benchmark.timings.proving,
      unit: 'ms',
    });
  }
  if (benchmark.maxMemory) {
    benches.push({
      name: `${benchmark.name}/max_memory`,
      value: benchmark.maxMemory,
      unit: 'MiB',
    });
  }
  return benches;
}

export async function captureProfile(
  label: string,
  interaction: ContractFunctionInteraction | DeployMethod,
  opts?: Omit<ProfileMethodOptions & DeployOptions, 'profileMode'>,
  expectedSteps?: number,
) {
  // Make sure the proxy logger starts from a clean slate
  ProxyLogger.getInstance().flushLogs();
  const result = await interaction.profile({ ...opts, profileMode: 'full', skipProofGeneration: false });
  const logs = ProxyLogger.getInstance().getLogs();
  if (expectedSteps !== undefined && result.executionSteps.length !== expectedSteps) {
    throw new Error(`Expected ${expectedSteps} execution steps, got ${result.executionSteps.length}`);
  }
  const benchmark = generateBenchmark(label, logs, result.stats, result.executionSteps, 'wasm', undefined);

  const ivcFolder = process.env.CAPTURE_IVC_FOLDER;
  if (ivcFolder) {
    logger.info(`Capturing client ivc execution profile for ${label}`);

    const resultsDirectory = join(ivcFolder, label);
    logger.info(`Writing private execution steps to ${resultsDirectory}`);
    await mkdir(resultsDirectory, { recursive: true });
    // Write the client IVC files read by the prover.
    const ivcInputsPath = join(resultsDirectory, 'ivc-inputs.msgpack');
    await writeFile(ivcInputsPath, serializePrivateExecutionSteps(result.executionSteps));
    await writeFile(join(resultsDirectory, 'logs.json'), JSON.stringify(logs, null, 2));
    await writeFile(join(resultsDirectory, 'benchmark.json'), JSON.stringify(benchmark, null, 2));
    logger.info(`Wrote private execution steps to ${resultsDirectory}`);
  }

  const benchOutput = process.env.BENCH_OUTPUT;
  if (benchOutput) {
    await mkdir(benchOutput, { recursive: true });
    const ghBenchmark = convertProfileToGHBenchmark(benchmark);
    const benchFile = join(benchOutput, `${label}.bench.json`);
    await writeFile(benchFile, JSON.stringify(ghBenchmark));
    logger.info(`Wrote benchmark to ${benchFile}`);
  }

  return result;
}
