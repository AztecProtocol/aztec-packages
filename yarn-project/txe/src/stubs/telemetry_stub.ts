// Lightweight stand-in for `@aztec/telemetry-client` used only when bundling the TXE worker /
// bin. The real package's barrel re-exports `wrappers/*` which transitively pulls in
// `koa-router`, `raw-body`, `iconv-lite`, and `mime-db` (HTTP server wrappers) — none of which
// the TXE worker invokes. Aliased in by `esbuild.config.mjs`.
//
// We re-export from individual source files in the telemetry-client workspace package (relative
// path) so that the package's restrictive `exports` field doesn't get in the way. Consumers
// continue to import "@aztec/telemetry-client" without modification at the source level.
//
// The transitive `./start.js` import (which contains `await import('./otel.js')`) is rerouted
// to a Noop-only stub by a separate esbuild plugin (see `telemetry_start_stub.ts`), which keeps
// the 1.2 MiB OpenTelemetry SDK chunk off the build.
/* eslint-disable no-restricted-imports, import-x/no-relative-packages */

export * from '../../../telemetry-client/dest/telemetry.js';
export * as Metrics from '../../../telemetry-client/dest/metrics.js';
export * as Attributes from '../../../telemetry-client/dest/attributes.js';
export * from '../../../telemetry-client/dest/noop.js';
export * from '../../../telemetry-client/dest/with_tracer.js';
export * from '../../../telemetry-client/dest/start.js';
export * from '../../../telemetry-client/dest/otel_propagation.js';
export * from '../../../telemetry-client/dest/lmdb_metrics.js';
export * from '../../../telemetry-client/dest/l1_metrics.js';
export * from '../../../telemetry-client/dest/prom_otel_adapter.js';
export * from '../../../telemetry-client/dest/wrappers/fetch.js';
export * from '../../../telemetry-client/dest/wrappers/l2_block_stream.js';
// Deliberately omitted: `wrappers/json_rpc_server.js` — drags in koa-router/raw-body and isn't
// used by anything in TXE's actual call paths.
