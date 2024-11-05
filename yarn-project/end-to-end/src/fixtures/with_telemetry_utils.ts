import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import {
  type TelemetryClientConfig,
  createAndStartTelemetryClient,
  getConfigEnvVars as getTelemetryConfig,
} from '@aztec/telemetry-client/start';

export function getEndToEndTestTelemetryClient(metricsPort?: number, serviceName?: string): Promise<TelemetryClient> {
  return !metricsPort
    ? Promise.resolve(new NoopTelemetryClient())
    : createAndStartTelemetryClient(getEndToEndTestTelemetryConfig(metricsPort, serviceName));
}

/**
 * Utility functions for setting up end-to-end tests with telemetry.
 *
 * Read from env vars, override if metricsPort is set
 */
export function getEndToEndTestTelemetryConfig(metricsPort?: number, serviceName?: string) {
  const telemetryConfig: TelemetryClientConfig = getTelemetryConfig();
  if (metricsPort) {
    telemetryConfig.metricsCollectorUrl = new URL(`http://127.0.0.1:${metricsPort}/v1/metrics`);
    telemetryConfig.tracesCollectorUrl = new URL(`http://127.0.0.1:${metricsPort}/v1/traces`);
    telemetryConfig.logsCollectorUrl = new URL(`http://127.0.0.1:${metricsPort}/v1/logs`);
    // Set faster collection and export times for end-to-end tests
    telemetryConfig.otelCollectIntervalMs = 5000;
    telemetryConfig.otelExportTimeoutMs = 2500;
  }
  if (serviceName) {
    telemetryConfig.serviceName = serviceName;
  }
  return telemetryConfig;
}
