import { mean, stdDev } from '@aztec/foundation/collection';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { MetricsType, TelemetryClient, ValueType } from '@aztec/telemetry-client';
import { Metrics } from '@aztec/telemetry-client';
import { type BenchmarkDataPoint, BenchmarkTelemetryClient } from '@aztec/telemetry-client/bench';

import { writeFileSync } from 'fs';

let telemetry: BenchmarkTelemetryClient | undefined = undefined;
function getTelemetryClient(): BenchmarkTelemetryClient {
  if (!telemetry) {
    telemetry = new BenchmarkTelemetryClient();
  }
  return telemetry as BenchmarkTelemetryClient;
}

/**
 * Setup for benchmarking.
 */
export function benchmarkSetup(
  /** What metrics to export */
  metrics: (MetricsType | MetricFilter)[],
  /** Where to output the benchmark data (defaults to BENCH_OUTPUT or bench.json) */
  benchOutput: string = process.env.BENCH_OUTPUT ?? 'bench.json',
  logger: Logger = createLogger('simulator-benchmark'),
): {
  telemetryClient: TelemetryClient;
  teardown: () => Promise<void>;
} {
  const telemetryClient = getTelemetryClient();
  telemetryClient.clear();
  const origTeardown = async () => {};
  const teardown = async () => {
    await telemetryClient.flush();
    const data = telemetryClient.getMeters();
    // pretty-print the metrics
    printMetrics(data, metrics, logger);
    // format the metrics for the github action  benchmark
    const formatted = formatMetricsForGithubBenchmarkAction(data, metrics);
    if (formatted.length === 0) {
      throw new Error(`No benchmark data generated. Please review your test setup.`);
    }
    // write to file for github action benchmark
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

// strip prefixes
function stripMetricPrefix(metric: string) {
  return metric.replace(`${Metrics.PUBLIC_EXECUTOR_PREFIX}simulation_`, '');
}
function stripPublicTxSimulatorPrefix(metric: string) {
  return metric.replace('PublicTxSimulator.', '');
}

/**
 * Prints metrics in the format: <meter name>: <metric0 & units>, <metric1 & units>
 * WARNING: This function should not be used with many data points. It is meant for brief benchmark tests
 * with only a few data points.
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
