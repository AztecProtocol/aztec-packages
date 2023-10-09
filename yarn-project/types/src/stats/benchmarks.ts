import { MetricName } from './metrics.js';

export type BenchmarkResults = Partial<Record<MetricName, BenchmarkMetricResults>>;

export type BenchmarkMetricResults = Record<string, number>;

export type BenchmarkResultsWithTimestamp = BenchmarkResults & { timestamp: string };
