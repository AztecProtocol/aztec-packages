/* eslint-disable no-restricted-imports, import-x/no-relative-packages */
import { NoopTelemetryClient } from '../../../../telemetry-client/dest/noop.js';
import type { TelemetryClient } from '../../../../telemetry-client/dest/telemetry.js';

export * from '../../../../telemetry-client/dest/config.js';

const noopTelemetry: TelemetryClient = new NoopTelemetryClient();

export function getTelemetryClient(): TelemetryClient {
  return noopTelemetry;
}

export function initTelemetryClient(): Promise<TelemetryClient> {
  return Promise.resolve(noopTelemetry);
}
