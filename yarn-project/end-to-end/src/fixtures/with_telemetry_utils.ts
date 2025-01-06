import { levels, registerLoggingStream } from '@aztec/foundation/log';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { OTelPinoStream } from '@aztec/telemetry-client/otel-pino-stream';
import {
  type TelemetryClientConfig,
  createAndStartTelemetryClient,
  getConfigEnvVars as getTelemetryConfig,
} from '@aztec/telemetry-client/start';

let telemetryClient: Promise<TelemetryClient> | undefined;
export function getEndToEndTestTelemetryClient(metricsPort?: number): Promise<TelemetryClient> {
  if (!metricsPort) {
    return Promise.resolve(new NoopTelemetryClient());
  }
  if (!telemetryClient) {
    telemetryClient = createEndToEndTestOtelClient(metricsPort);
  }
  return telemetryClient;
}

function createEndToEndTestOtelClient(metricsPort: number): Promise<TelemetryClient> {
  const otelStream = new OTelPinoStream({ levels });
  registerLoggingStream(otelStream);
  return createAndStartTelemetryClient(getEndToEndTestTelemetryConfig(metricsPort));
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
