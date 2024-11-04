import { TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { TelemetryClientConfig, getConfigEnvVars as getTelemetryConfig, createAndStartTelemetryClient } from '@aztec/telemetry-client/start';

export function getEndToEndTestTelemetryClient(metricsPort?: number): Promise<TelemetryClient> {
  return !metricsPort
    ? Promise.resolve(new NoopTelemetryClient())
    : createAndStartTelemetryClient(getEndToEndTestTelemetryConfig(metricsPort));
}

/**
 * Utility functions for setting up end-to-end tests with telemetry.
 *
 * Read from env vars, override if metricsPort is set
 */
export function getEndToEndTestTelemetryConfig(metricsPort?: number) {
  const telemetryConfig: TelemetryClientConfig = getTelemetryConfig();
  if (metricsPort) {
    telemetryConfig.metricsCollectorUrl = new URL(`http://127.0.0.1:${metricsPort}/v1/metrics`);
    telemetryConfig.tracesCollectorUrl = new URL(`http://127.0.0.1:${metricsPort}/v1/traces`);
    telemetryConfig.logsCollectorUrl = new URL(`http://127.0.0.1:${metricsPort}/v1/logs`);
  }
  return telemetryConfig;
}