import { mean, stdDev } from '@aztec/foundation/collection';
import { randomInt } from '@aztec/foundation/crypto';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { MetricsType, TelemetryClient, ValueType } from '@aztec/telemetry-client';
import { type BenchmarkDataPoint, BenchmarkTelemetryClient } from '@aztec/telemetry-client/bench';

import { writeFileSync } from 'fs';
import { mkdirpSync } from 'fs-extra';
import { globSync } from 'glob';
import { join } from 'path';

import { PUBLIC_EXECUTOR_PREFIX } from '../../../telemetry-client/src/metrics.js';
import { PublicTxSimulator } from '../server.js';

let telemetry: BenchmarkTelemetryClient | undefined = undefined;
//function getTelemetryClient(partialConfig: Partial<TelemetryClientConfig> & { benchmark?: boolean } = {}): BenchmarkTelemetryClient {
function getTelemetryClient(): BenchmarkTelemetryClient {
  if (!telemetry) {
    //const config = { ...getTelemetryConfig(), ...partialConfig };
    //telemetry = config.benchmark ? new BenchmarkTelemetryClient() : initTelemetryClient(config);
    telemetry = new BenchmarkTelemetryClient();
  }
  return telemetry as BenchmarkTelemetryClient;
}

/**
 * Setup for benchmarking.
 */
export function benchmarkSetup(
  //telemetryConfig: Partial<TelemetryClientConfig>,
  /** What metrics to export */
  metrics: (MetricsType | MetricFilter)[],
  /** Where to output the benchmark data (defaults to BENCH_OUTPUT or bench.json) */
  benchOutput: string = process.env.BENCH_OUTPUT ?? 'bench.json',
  logger: Logger = createLogger('simulator-benchmark'),
): {
  telemetryClient: TelemetryClient;
  teardown: () => Promise<void>;
} {
  //const telemetryClient = getTelemetryClient(telemetryConfig);
  const telemetryClient = getTelemetryClient();
  telemetryClient.clear();
  const origTeardown = async () => {};
  const teardown = async () => {
    await telemetryClient.flush();
    const data = telemetryClient.getMeters();
    const formatted = formatMetricsForGithubBenchmarkAction(data, metrics);
    printMetrics(data, metrics, logger);
    if (formatted.length === 0) {
      throw new Error(`No benchmark data generated. Please review your test setup.`);
    }
    writeFileSync(benchOutput, JSON.stringify(formatted));
    logger.info(`Wrote ${data.length} metrics to ${benchOutput}`);
    await origTeardown();
  };
  return { telemetryClient, teardown };
}

export type BenchmarkMetricsType = {
  name: string;
  metrics: {
    name: string;
    type: 'gauge' | 'counter' | 'histogram';
    description?: string;
    unit?: string;
    valueType?: ValueType;
    points: BenchmarkDataPoint[];
  }[];
}[];

type MetricFilter = {
  source: MetricsType;
  transform: (value: number) => number;
  name: string;
  unit?: string;
};

// See https://github.com/benchmark-action/github-action-benchmark/blob/e3c661617bc6aa55f26ae4457c737a55545a86a4/src/extract.ts#L659-L670
type GithubActionBenchmarkResult = {
  name: string;
  value: number;
  range?: string;
  unit: string;
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

// strip prefixes
function stripMetricPrefix(metric: string) {
  return metric.replace(PUBLIC_EXECUTOR_PREFIX, '');
}
function stripPublicTxSimulatorPrefix(metric: string) {
  return metric.replace('PublicTxSimulator.', '');
}

/**
 * Prints metrics in the format: <meter name>: <metric0 & units>, <metric1 & units>
 */
export function printMetrics(data: BenchmarkMetricsType, filter: (MetricsType | MetricFilter)[], logger: Logger) {
  const allFilters: MetricFilter[] = filter.map(f =>
    typeof f === 'string' ? { name: f, source: f, transform: (x: number) => x, unit: undefined } : f,
  );

  let nonEmpty = false;
  for (const meter of data) {
    const entries = [];
    for (const metric of meter.metrics) {
      if (allFilters.map(f => f.source).includes(metric.name as MetricsType)) {
        const filter = allFilters.find(f => f.source === metric.name)!;
        const values = getMetricValues(metric.points.map(p => ({ ...p, value: filter.transform(p.value) })));
        if (values.value !== undefined) {
          const unit = filter.unit ?? metric.unit ?? '';
          entries.push(`${stripMetricPrefix(metric.name)}: ${values.value} ${unit}`);
        }
      }
    }

    if (entries.length > 0) {
      logger.info(`--------------------------------------------------------------------------------`);
      logger.info(`${stripPublicTxSimulatorPrefix(meter.name)}:`);
      for (const entry of entries) {
        logger.info(`\t${entry}`);
      }
      nonEmpty = true;
    }
  }
  if (nonEmpty) {
    logger.info(`--------------------------------------------------------------------------------`);
  }
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
 * Creates and returns a directory with the current job name and a random number.
 * @param index - Index to merge into the dir path.
 * @returns A path to a created dir.
 */
export function makeDataDirectory(index: number) {
  const testName = expect.getState().currentTestName!.split(' ')[0].replaceAll('/', '_');
  const db = join('data', testName, index.toString(), `${randomInt(99)}`);
  mkdirpSync(db);
  return db;
}

/**
 * Returns the size in disk of a folder.
 * @param path - Path to the folder.
 * @returns Size in bytes.
 */
export function getFolderSize(path: string): number {
  return globSync('**', { stat: true, cwd: path, nodir: true, withFileTypes: true }).reduce(
    (accum, file) => accum + (file as any as { /** Size */ size: number }).size,
    0,
  );
}
