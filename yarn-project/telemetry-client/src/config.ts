export interface TelemetryClientConfig {
  collectorBaseUrl?: URL;
  serviceName: string;
  serviceVersion: string;
}

export function getConfigEnvVars(): TelemetryClientConfig {
  const { TEL_COLLECTOR_BASE_URL, TEL_SERVICE_NAME = 'aztec', TEL_SERVICE_VERSION = '0.0.0' } = process.env;

  return {
    collectorBaseUrl: TEL_COLLECTOR_BASE_URL ? new URL(TEL_COLLECTOR_BASE_URL) : undefined,
    serviceName: TEL_SERVICE_NAME,
    serviceVersion: TEL_SERVICE_VERSION,
  };
}
