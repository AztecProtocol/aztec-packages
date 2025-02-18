import { type ConfigMappingsType, booleanConfigHelper, getConfigFromMappings } from '@aztec/foundation/config';

export interface TelemetryClientConfig {
  useGcloudMetrics: boolean;
  metricsCollectorUrl?: URL;
  tracesCollectorUrl?: URL;
  logsCollectorUrl?: URL;
  serviceName: string;
  networkName: string;
  otelCollectIntervalMs: number;
  otelExportTimeoutMs: number;
  k8sPodUid?: string;
  k8sPodName?: string;
  k8sNamespaceName?: string;
  otelExcludeMetrics?: string[];
}

export const telemetryClientConfigMappings: ConfigMappingsType<TelemetryClientConfig> = {
  useGcloudMetrics: {
    env: 'USE_GCLOUD_METRICS',
    description: 'Whether to use GCP metrics and traces',
    ...booleanConfigHelper(false),
  },
  metricsCollectorUrl: {
    env: 'OTEL_EXPORTER_OTLP_METRICS_ENDPOINT',
    description: 'The URL of the telemetry collector for metrics',
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
  serviceName: {
    env: 'OTEL_SERVICE_NAME',
    description: 'The name of the service (attached as metadata to collected metrics)',
    defaultValue: 'aztec',
  },
  networkName: {
    env: 'NETWORK_NAME',
    description: 'The network ID of the telemetry service',
    defaultValue: 'local',
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
  k8sPodUid: {
    env: 'K8S_POD_UID',
    description: 'The UID of the Kubernetes pod (injected automatically by k8s)',
  },
  k8sPodName: {
    env: 'K8S_POD_NAME',
    description: 'The name of the Kubernetes pod (injected automatically by k8s)',
  },
  k8sNamespaceName: {
    env: 'K8S_NAMESPACE_NAME',
    description: 'The name of the Kubernetes namespace (injected automatically by k8s)',
  },
};

export function getConfigEnvVars(): TelemetryClientConfig {
  return getConfigFromMappings<TelemetryClientConfig>(telemetryClientConfigMappings);
}
