import { OpenTelemetryClient, getConfigEnvVars } from '@aztec/telemetry-client';
import { setTelemetryClient } from '@aztec/telemetry-client/global';

export function initTelemetryClient() {
  const config = getConfigEnvVars();

  if (config.collectorBaseUrl) {
    setTelemetryClient(
      OpenTelemetryClient.createAndStart(config.serviceName, config.serviceVersion, config.collectorBaseUrl),
    );
  }
}
