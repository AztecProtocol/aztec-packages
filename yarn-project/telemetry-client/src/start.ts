import { createLogger } from '@aztec/foundation/log';

import type { TelemetryClientConfig } from './config.js';
import { NoopTelemetryClient } from './noop.js';
import type { TelemetryClient } from './telemetry.js';

export * from './config.js';

let initialized = false;
let telemetry: TelemetryClient = new NoopTelemetryClient();

export async function initTelemetryClient(config: TelemetryClientConfig): Promise<TelemetryClient> {
  const log = createLogger('telemetry:client');
  if (initialized) {
    log.warn('Telemetry client has already been initialized once');
    return telemetry;
  }

  if (config.metricsCollectorUrl || config.publicMetricsCollectorUrl) {
    log.info(`Using OpenTelemetry client with custom collector`);
    // Lazy load OpenTelemetry to avoid loading heavy deps at startup
    const { OpenTelemetryClient } = await import('./otel.js');
    telemetry = OpenTelemetryClient.createAndStart(config, log);
  } else {
    log.info('Using NoopTelemetryClient');
  }

  initialized = true;
  return telemetry;
}

export function getTelemetryClient(): TelemetryClient {
  return telemetry;
}
