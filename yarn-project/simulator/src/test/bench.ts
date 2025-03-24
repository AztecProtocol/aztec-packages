import { mean, stdDev } from '@aztec/foundation/collection';
import { randomInt } from '@aztec/foundation/crypto';
import { type Logger, createLogger } from '@aztec/foundation/log';
import type { MetricsType, TelemetryClient, ValueType } from '@aztec/telemetry-client';
import { type BenchmarkDataPoint, BenchmarkTelemetryClient } from '@aztec/telemetry-client/bench';

import { writeFileSync } from 'fs';
import { mkdirpSync } from 'fs-extra';
import { globSync } from 'glob';
import { join } from 'path';

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
    printMetricsAsTable(data, metrics, logger);
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

export const TableStyle = {
  leftOutline: '| ',
  rightOutline: ' |',
  topOutlineColumnBorder: '-+-',
  bottomOutlineColumnBorder: '-+-',
  topLeftOutline: '+-',
  bottomLeftOutline: '+-',
  topRightOutline: '-+',
  bottomRightOutline: '-+',
  horizontalOutline: '-',
  leftOutlineRowBorder: '+-',
  rightOutlineRowBorder: '-+',
  leftHeaderRowBorder: '+-',
  rightHeaderRowBorder: '-+',
  headerBorder: '-',
  headerBorderCrossing: '-+-',
  headerNoBorderCrossing: '--',
  outlineNoBorderCrossing: '--',
};

function printMetricsAsTable(data: BenchmarkMetricsType, filter: (MetricsType | MetricFilter)[], logger: Logger) {
  const allFilters: MetricFilter[] = filter.map(f =>
    typeof f === 'string' ? { name: f, source: f, transform: (x: number) => x, unit: undefined } : f,
  );

  // First, find all unique metrics
  const uniqueMetrics = new Set<string>();
  for (const meter of data) {
    const filteredMetrics = meter.metrics.filter(metric =>
      allFilters.map(f => f.source).includes(metric.name as MetricsType),
    );
    for (const metric of filteredMetrics) {
      uniqueMetrics.add(metric.name);
    }
  }
  const uniqueMetricsArray = Array.from(uniqueMetrics);

  // Group data by meter
  const meterData: Record<string, Record<string, { value: number; unit: string }>> = {};

  for (const meter of data) {
    const metricsForMeter: Record<string, { value: number; unit: string }> = {};

    for (const metric of meter.metrics) {
      if (allFilters.map(f => f.source).includes(metric.name as MetricsType)) {
        const filter = allFilters.find(f => f.source === metric.name)!;
        const values = getMetricValues(metric.points.map(p => ({ ...p, value: filter.transform(p.value) })));
        if (values.value !== undefined) {
          metricsForMeter[metric.name] = {
            value: values.value,
            unit: filter.unit ?? metric.unit ?? 'unknown',
          };
        }
      }
    }

    if (Object.keys(metricsForMeter).length > 0) {
      meterData[meter.name] = metricsForMeter;
    }
  }

  // If no data, return early
  if (Object.keys(meterData).length === 0) {
    logger.info('No metrics data to display.');
    return;
  }

  // Calculate column widths
  const meterWidth = Math.max(10, ...Object.keys(meterData).map(name => name.length));
  const metricWidths: Record<string, number> = {};

  for (const metric of uniqueMetricsArray) {
    // Calculate width based on metric name and values
    const valueWidths = Object.values(meterData)
      .filter(m => m[metric])
      .map(m => {
        const formattedValue = `${m[metric].value.toFixed(2)} ${m[metric].unit}`;
        return formattedValue.length;
      });

    metricWidths[metric] = Math.max(metric.length, ...valueWidths);
  }

  // Define a single character for all vertical separators
  const verticalSeparator = TableStyle.leftOutline.trimEnd();

  // Build the top border
  let topBorder = TableStyle.topLeftOutline + TableStyle.horizontalOutline.repeat(meterWidth);
  for (const metric of uniqueMetricsArray) {
    topBorder += TableStyle.topOutlineColumnBorder + TableStyle.horizontalOutline.repeat(metricWidths[metric]);
  }
  topBorder += TableStyle.topRightOutline;

  // Build the header row
  let headerRow = verticalSeparator + ' ' + 'Meter'.padEnd(meterWidth) + ' ';
  for (const metric of uniqueMetricsArray) {
    headerRow += verticalSeparator + ' ' + metric.padEnd(metricWidths[metric] - 1) + ' ';
  }
  headerRow += verticalSeparator;

  // Build the separator
  let headerSeparator = TableStyle.leftHeaderRowBorder + TableStyle.headerBorder.repeat(meterWidth);
  for (const metric of uniqueMetricsArray) {
    headerSeparator += TableStyle.headerBorderCrossing + TableStyle.headerBorder.repeat(metricWidths[metric]);
  }
  headerSeparator += TableStyle.rightHeaderRowBorder;

  // Build the bottom border
  let bottomBorder = TableStyle.bottomLeftOutline + TableStyle.horizontalOutline.repeat(meterWidth);
  for (const metric of uniqueMetricsArray) {
    bottomBorder += TableStyle.bottomOutlineColumnBorder + TableStyle.horizontalOutline.repeat(metricWidths[metric]);
  }
  bottomBorder += TableStyle.bottomRightOutline;

  // Output the table
  logger.info(topBorder);
  logger.info(headerRow);
  logger.info(headerSeparator);

  // Output data rows
  for (const [meterName, metrics] of Object.entries(meterData)) {
    let row = verticalSeparator + ' ' + meterName.padEnd(meterWidth) + ' ';

    for (const metricName of uniqueMetricsArray) {
      const metricData = metrics[metricName];
      if (metricData) {
        const formattedValue = `${metricData.value.toFixed(2)} ${metricData.unit}`;
        row += verticalSeparator + ' ' + formattedValue.padEnd(metricWidths[metricName]) + ' ';
      } else {
        row += verticalSeparator + ' ' + '-'.repeat(metricWidths[metricName]) + ' ';
      }
    }

    row += verticalSeparator;
    logger.info(row);
  }

  // Output bottom border
  logger.info(bottomBorder);
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
