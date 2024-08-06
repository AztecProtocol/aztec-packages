import { type ConfigMappingsType, getConfigFromMappings } from '@aztec/foundation/config';
import { createDebugLogger } from '@aztec/foundation/log';

import { NoopTelemetryClient } from './noop.js';
import { OpenTelemetryClient } from './otel.js';
import { type TelemetryClient } from './telemetry.js';

export interface TelemetryClientConfig {
  collectorBaseUrl?: URL;
  serviceName: string;
  serviceVersion: string;
  networkId: string;
}

export const telemetryClientConfigMappings: ConfigMappingsType<TelemetryClientConfig> = {
  collectorBaseUrl: {
    env: 'TEL_COLLECTOR_BASE_URL',
    description: 'The URL of the telemetry collector',
    parseEnv: (val: string) => new URL(val),
  },
  serviceName: {
    env: 'TEL_SERVICE_NAME',
    description: 'The name of the telemetry service',
    default: 'aztec',
  },
  serviceVersion: {
    env: 'TEL_SERVICE_VERSION',
    description: 'The version of the telemetry service',
    default: '0.0.0',
  },
  networkId: {
    env: 'TEL_NETWORK_ID',
    description: 'The network ID of the telemetry service',
    default: 'local',
  },
};

export function createAndStartTelemetryClient(config: TelemetryClientConfig): TelemetryClient {
  const log = createDebugLogger('aztec:telemetry-client');
  if (config.collectorBaseUrl) {
    log.info('Using OpenTelemetry client');
    return OpenTelemetryClient.createAndStart(
      config.serviceName,
      config.serviceVersion,
      config.networkId,
      config.collectorBaseUrl,
      log,
    );
  } else {
    log.info('Using NoopTelemetryClient');
    return new NoopTelemetryClient();
  }
}

export function getConfigEnvVars(): TelemetryClientConfig {
  return getConfigFromMappings<TelemetryClientConfig>(telemetryClientConfigMappings);
}
