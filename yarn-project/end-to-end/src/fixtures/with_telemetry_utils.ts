import { levels, registerLoggingStream } from '@aztec/foundation/log';
import {
  type TelemetryClient,
  type TelemetryClientConfig,
  getConfigEnvVars as getTelemetryConfig,
  initTelemetryClient,
} from '@aztec/telemetry-client';
import { OTelPinoStream } from '@aztec/telemetry-client/otel-pino-stream';

export function getEndToEndTestTelemetryClient(metricsPort?: number): Promise<TelemetryClient> {
  if (metricsPort) {
    const otelStream = new OTelPinoStream({ levels });
    registerLoggingStream(otelStream);
  }
  return initTelemetryClient(getEndToEndTestTelemetryConfig(metricsPort));
}

/**
 * Utility functions for setting up end-to-end tests with telemetry.
 *
 * Read from env vars, override if metricsPort is set
 */
function getEndToEndTestTelemetryConfig(metricsPort?: number) {
  const telemetryConfig: TelemetryClientConfig = getTelemetryConfig();
  if (metricsPort) {
    telemetryConfig.metricsCollectorUrl = new URL(`http://127.0.0.1:${metricsPort}/v1/metrics`);
    telemetryConfig.tracesCollectorUrl = new URL(`http://127.0.0.1:${metricsPort}/v1/traces`);
    telemetryConfig.logsCollectorUrl = new URL(`http://127.0.0.1:${metricsPort}/v1/logs`);
    // Set faster collection and export times for end-to-end tests
    telemetryConfig.otelCollectIntervalMs = 5000;
    telemetryConfig.otelExportTimeoutMs = 2500;
  }
  return telemetryConfig;
}
