import { createLogger } from '@aztec/foundation/log';

import { type TelemetryClientConfig } from './config.js';
import { NoopTelemetryClient } from './noop.js';
import { OpenTelemetryClient } from './otel.js';
import { type TelemetryClient } from './telemetry.js';

export * from './config.js';

export async function createAndStartTelemetryClient(config: TelemetryClientConfig): Promise<TelemetryClient> {
  const log = createLogger('telemetry:client');
  if (config.metricsCollectorUrl || config.useGcloudObservability) {
    log.info(`Using OpenTelemetry client ${config.useGcloudObservability ? 'with GCP' : 'with custom collector'}`);
    return await OpenTelemetryClient.createAndStart(config, log);
  } else {
    log.info('Using NoopTelemetryClient');
    return new NoopTelemetryClient();
  }
}
