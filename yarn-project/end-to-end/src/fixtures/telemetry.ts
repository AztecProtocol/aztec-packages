import { InMemoryTelemetryClient, OpenTelemetryClient, getConfigEnvVars } from '@aztec/telemetry-client';
import { setTelemetryClient } from '@aztec/telemetry-client/global';

// guard against calling init multiple times (e.g. calling setup in beforeEach)
let telemetryClient: InMemoryTelemetryClient | OpenTelemetryClient | undefined;
export function initTelemetry() {
  if (telemetryClient) {
    return;
  }

  const config = getConfigEnvVars();
  if (config.collectorBaseUrl) {
    telemetryClient = OpenTelemetryClient.createAndStart(
      config.serviceName,
      config.serviceVersion,
      config.collectorBaseUrl,
    );
  } else {
    // TODO (alexg): consider using test name instead of service name (or add the test name as an attribute on the resource)
    telemetryClient = InMemoryTelemetryClient.createAndStart(config.serviceName, config.serviceVersion);
  }

  setTelemetryClient(telemetryClient);
}
