import { createLogger } from '@aztec/foundation/log';

import { type TelemetryClientConfig } from './config.js';
import { NoopTelemetryClient } from './noop.js';
import { OpenTelemetryClient } from './otel.js';
import { type TelemetryClient } from './telemetry.js';

export * from './config.js';

let initialised = false;
let telemetry: TelemetryClient = new NoopTelemetryClient();

export async function initTelemetryClient(config: TelemetryClientConfig): Promise<TelemetryClient> {
  const log = createLogger('telemetry:client');
<<<<<<< HEAD
  if (config.metricsCollectorUrl || config.useGcloudObservability) {
    log.info(`Using OpenTelemetry client ${config.useGcloudObservability ? 'with GCP' : 'with custom collector'}`);
    return await OpenTelemetryClient.createAndStart(config, log);
=======
  if (initialised) {
    log.warn('Telemetry client has already been initialized once');
    return telemetry;
  }

  initialised = true;
  if (config.metricsCollectorUrl) {
    log.info('Using OpenTelemetry client');
    telemetry = await OpenTelemetryClient.createAndStart(config, log);
>>>>>>> 1f11010e9f (refactor: global telemetry client)
  } else {
    log.info('Using NoopTelemetryClient');
  }

  return telemetry;
}

export function getTelemetryClient(): TelemetryClient {
  return telemetry;
}
