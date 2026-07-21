import {
  type ConfigMappingsType,
  booleanConfigHelper,
  getConfigFromMappings,
  numberConfigHelper,
} from '@aztec/foundation/config';

export interface TelemetryClientConfig {
  metricsCollectorUrl?: URL;
  publicMetricsCollectorUrl?: URL;
  publicIncludeMetrics: string[];
  publicMetricsOptOut: boolean;
  publicMetricsCollectFrom: string[];
  tracesCollectorUrl?: URL;
  logsCollectorUrl?: URL;
  otelCollectIntervalMs: number;
  otelExportTimeoutMs: number;
  otelExcludeMetrics: string[];
  otelIncludeMetrics: string[];
  otelMinTraceDurationMs: number;
  otelBspMaxQueueSize: number;
}

export const telemetryClientConfigMappings: ConfigMappingsType<TelemetryClientConfig> = {
  metricsCollectorUrl: {
    env: 'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
    description: 'The URL of the telemetry collector for metrics',
    parseEnv: (val: string) => new URL(val),
  },
  tracesCollectorUrl: {
    env: 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
    description: 'The URL of the telemetry collector for traces',
    parseEnv: (val: string) => new URL(val),
  },
  logsCollectorUrl: {
    env: 'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT',
    description: 'The URL of the telemetry collector for logs',
    parseEnv: (val: string) => new URL(val),
  },
  otelCollectIntervalMs: {
    env: 'OTEL_COLLECT_INTERVAL_MS',
    description: 'The interval at which to collect metrics',
    ...numberConfigHelper(60000),
  },
  otelExportTimeoutMs: {
    env: 'OTEL_EXPORT_TIMEOUT_MS',
    description: 'The timeout for exporting metrics',
    ...numberConfigHelper(30000),
  },
  otelExcludeMetrics: {
    env: 'OTEL_EXCLUDE_METRICS',
    description: 'A list of metric prefixes to exclude from export',
    parseEnv: (val: string) =>
      val
        ? val
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0)
        : [],
    defaultValue: [],
  },
  otelMinTraceDurationMs: {
    env: 'OTEL_MIN_TRACE_DURATION_MS',
    description: 'The minimum successful trace duration to export in milliseconds. Set to 0 to export all traces.',
    ...numberConfigHelper(10),
  },
  otelBspMaxQueueSize: {
    env: 'OTEL_BSP_MAX_QUEUE_SIZE',
    description: 'The maximum number of completed spans to queue before export.',
    ...numberConfigHelper(16384),
  },
  otelIncludeMetrics: {
    env: 'OTEL_INCLUDE_METRICS',
    description: 'A list of metric prefixes to include in export (ignored if OTEL_EXCLUDE_METRICS is set)',
    parseEnv: (val: string) =>
      val
        ? val
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0)
        : [],
    defaultValue: [],
  },

  publicMetricsCollectorUrl: {
    env: 'PUBLIC_OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
    description: 'A URL to publish a subset of metrics for public consumption',
    parseEnv: (val: string) => new URL(val),
  },
  publicMetricsCollectFrom: {
    env: 'PUBLIC_OTEL_COLLECT_FROM',
    description: 'The role types to collect metrics from',
    parseEnv: (val: string) =>
      val
        ? val
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0)
        : [],
    defaultValue: [],
  },
  publicIncludeMetrics: {
    env: 'PUBLIC_OTEL_INCLUDE_METRICS',
    description: 'A list of metric prefixes to publicly export',
    parseEnv: (val: string) =>
      val
        ? val
            .split(',')
            .map(s => s.trim())
            .filter(s => s.length > 0)
        : [],
    defaultValue: [],
  },
  publicMetricsOptOut: {
    env: 'PUBLIC_OTEL_OPT_OUT',
    description: 'Whether to opt out of sharing optional telemetry',
    ...booleanConfigHelper(true),
  },
};

export function getConfigEnvVars(): TelemetryClientConfig {
  return getConfigFromMappings<TelemetryClientConfig>(telemetryClientConfigMappings);
}
