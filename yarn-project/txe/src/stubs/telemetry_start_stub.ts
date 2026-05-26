// Replaces `@aztec/telemetry-client/dest/start.js` inside the TXE bundle. The real `start.ts`
// contains `await import('./otel.js')`, which causes esbuild to emit a 1.2 MiB lazy chunk for
// the OpenTelemetry SDK + sdk-logs + exporter-logs-otlp-http + systeminformation, even though
// TXE never calls `initTelemetryClient`. We expose the same surface (`getTelemetryClient`,
// `initTelemetryClient`, plus the `export * from './config.js'` that start.ts forwards) but
// without the dynamic import, so the otel chunk disappears from the graph.
/* eslint-disable no-restricted-imports, import-x/no-relative-packages */
import { NoopTelemetryClient } from '../../../telemetry-client/dest/noop.js';
import type { TelemetryClient } from '../../../telemetry-client/dest/telemetry.js';

export * from '../../../telemetry-client/dest/config.js';

const noopTelemetry: TelemetryClient = new NoopTelemetryClient();

export function getTelemetryClient(): TelemetryClient {
  return noopTelemetry;
}

export function initTelemetryClient(): Promise<TelemetryClient> {
  return Promise.resolve(noopTelemetry);
}
