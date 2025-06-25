import { type ConfigMappingsType, booleanConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';

export interface TelemetryClientConfig {
  metricsCollectorUrl?: URL;
  publicMetricsCollectorUrl?: URL;
  publicIncludeMetrics: string[];
  publicMetricsOptOut: boolean;
  tracesCollectorUrl?: URL;
  logsCollectorUrl?: URL;
  otelCollectIntervalMs: number;
  otelExportTimeoutMs: number;
  otelExcludeMetrics: string[];
}

export const telemetryClientConfigMappings: ConfigMappingsType<TelemetryClientConfig> = {
  metricsCollectorUrl: {
    env: 'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
    description: 'The URL of the telemetry collector for metrics',
    parseEnv: (val: string) => val && new URL(val),
  },
  publicMetricsCollectorUrl: {
    env: 'PUBLIC_OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
    description: 'A URL to publish a subset of metrics for public consumption',
    parseEnv: (val: string) => val && new URL(val),
  },
  tracesCollectorUrl: {
    env: 'OTEL_EXPORTER_OTLP_TRACES_ENDPOINT',
    description: 'The URL of the telemetry collector for traces',
    parseEnv: (val: string) => val && new URL(val),
  },
  logsCollectorUrl: {
    env: 'OTEL_EXPORTER_OTLP_LOGS_ENDPOINT',
    description: 'The URL of the telemetry collector for logs',
    parseEnv: (val: string) => val && new URL(val),
  },
  otelCollectIntervalMs: {
    env: 'OTEL_COLLECT_INTERVAL_MS',
    description: 'The interval at which to collect metrics',
    defaultValue: 60000, // Default extracted from otel client
    parseEnv: (val: string) => parseInt(val),
  },
  otelExportTimeoutMs: {
    env: 'OTEL_EXPORT_TIMEOUT_MS',
    description: 'The timeout for exporting metrics',
    defaultValue: 30000, // Default extracted from otel client
    parseEnv: (val: string) => parseInt(val),
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
    ...booleanConfigHelper(false),
  },
};

export function getConfigEnvVars(): TelemetryClientConfig {
  return getConfigFromMappings<TelemetryClientConfig>(telemetryClientConfigMappings);
}
