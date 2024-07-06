import { NoopTelemetryClient } from './noop.js';
import { type TelemetryClient } from './telemetry.js';

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace globalThis {
  let telemetryClient: TelemetryClient;
}

globalThis.telemetryClient ??= new NoopTelemetryClient();

export function getTelemetryClient(): TelemetryClient {
  return globalThis.telemetryClient;
}

export function setTelemetryClient(client: TelemetryClient): void {
  globalThis.telemetryClient = client;
}
