import { createLogger } from '@aztec/foundation/log';

import type { TelemetryClientConfig } from './config.js';
import { NoopTelemetryClient } from './noop.js';
import { OpenTelemetryClient } from './otel.js';
import type { TelemetryClient } from './telemetry.js';

export * from './config.js';

let initialised = false;
let telemetry: TelemetryClient = new NoopTelemetryClient();

export function initTelemetryClient(config: TelemetryClientConfig): TelemetryClient {
  const log = createLogger('telemetry:client');
  if (initialised) {
    log.warn('Telemetry client has already been initialized once');
    return telemetry;
  }

  if (config.metricsCollectorUrl || config.publicMetricsCollectorUrl) {
    log.info(`Using OpenTelemetry client with custom collector`);
    telemetry = OpenTelemetryClient.createAndStart(config, log);
  } else {
    log.info('Using NoopTelemetryClient');
  }

  initialised = true;
  return telemetry;
}

export function getTelemetryClient(): TelemetryClient {
  return telemetry;
}
