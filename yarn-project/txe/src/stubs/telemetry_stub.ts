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
// eslint-disable-next-line import-x/no-extraneous-dependencies
import { ValueType } from '@opentelemetry/api';

export * from '../../../telemetry-client/dest/telemetry.js';
export * from '../../../telemetry-client/dest/noop.js';
export * from '../../../telemetry-client/dest/with_tracer.js';
export * from '../../../telemetry-client/dest/start.js';
export * from '../../../telemetry-client/dest/otel_propagation.js';
export * from '../../../telemetry-client/dest/prom_otel_adapter.js';
export * from '../../../telemetry-client/dest/wrappers/fetch.js';
export * from '../../../telemetry-client/dest/wrappers/l2_block_stream.js';
// Deliberately omitted: `wrappers/json_rpc_server.js` — drags in koa-router/raw-body and isn't
// used by anything in TXE's actual call paths.
//
// `Metrics` and `Attributes` are namespace imports of constant tables (~66 KiB + ~7 KiB).
// Every consumer in the bundled graph (NodeMetrics, ArchiverMetrics, simulator metric
// recorders, etc.) reads them as `Metrics.<NAME>` to look up `{ name, description,
// valueType }` definitions which are then handed to a `Meter`. TXE's `Meter` is the Noop
// implementation from `noop.js`, so the values are read but never observed at runtime —
// we serve them lazily through a Proxy. Each access materialises a shape-compatible
// definition on the fly, avoiding the static import that pulls 66 KiB of constants.
// `Attributes` is smaller but follows the same pattern for the same reason.

type MetricDefinition = { name: string; description: string; valueType: ValueType };

/**
 * Stub for `LmdbMetrics` — the real class registers ~15 metrics on a meter to track LMDB
 * disk/key usage. Nothing in TXE reads those numbers (the meter is Noop), so the only
 * requirement is a constructable class with the right shape. Recording calls are no-ops.
 *
 * Re-implementing inline rather than re-exporting from `lmdb_metrics.js` because the real
 * file statically imports `Metrics.DB_*` constants from the 66 KiB `metrics.js` registry,
 * dragging it back into the bundle.
 */
export class LmdbMetrics {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  constructor(..._args: unknown[]) {}
  recordDBMetrics(): void {}
  start(): void {}
  stop(): void {}
}

/**
 * Generates a metric definition on demand, indexed by the static name (e.g.
 * `Metrics.NODE_RECEIVE_TX_COUNT` → `{ name: 'aztec.stub.node_receive_tx_count', ... }`).
 * The Meter on TXE is a Noop, so this value is never observed; only its shape matters.
 */
function makeMetricDefinition(prop: string): MetricDefinition {
  return {
    name: `aztec.stub.${prop.toLowerCase()}`,
    description: 'TXE stub metric',
    valueType: ValueType.INT,
  };
}

export const Metrics: Record<string, MetricDefinition> = new Proxy(Object.create(null), {
  get: (_target, prop) => (typeof prop === 'string' ? makeMetricDefinition(prop) : undefined),
});

export const Attributes: Record<string, string> = new Proxy(Object.create(null), {
  get: (_target, prop) => (typeof prop === 'string' ? `aztec.stub.${prop.toLowerCase()}` : undefined),
});
