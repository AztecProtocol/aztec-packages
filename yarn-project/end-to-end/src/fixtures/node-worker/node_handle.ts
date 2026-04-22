import type { AztecNodeService } from '@aztec/aztec-node';
import type { AztecNode, AztecNodeAdmin, AztecNodeDebug } from '@aztec/stdlib/interfaces/client';

import type { NodeWorker } from './node_worker.js';

/**
 * Unified handle for the initial node (and the optional prover node) spawned by {@link setup}.
 * Exposes the typed RPC surface; `service` is set only when the node is running inline on the main
 * thread (`opts.inlineNode === true`), which is needed by a handful of tests that subscribe to
 * sequencer events or monkey-patch prover internals.
 */
export type NodeHandle = {
  /** JSON-RPC-safe client surface. Works identically for worker-backed and inline-backed handles. */
  client: AztecNode & AztecNodeAdmin & AztecNodeDebug;
  /** The underlying `AztecNodeService` when running inline; `undefined` for worker-backed handles. */
  service: AztecNodeService | undefined;
  /** Stops the underlying node and releases any worker/bridge resources. */
  stop: () => Promise<void>;
};

/** Wraps a spawned `NodeWorker` into a `NodeHandle`. */
export function nodeHandleFromWorker(worker: NodeWorker): NodeHandle {
  return {
    client: worker.client,
    service: undefined,
    stop: () => worker.stop(),
  };
}

/**
 * Wraps an in-process `AztecNodeService` into a `NodeHandle`. Use only when `opts.inlineNode` is
 * set or auto-enabled (e.g. bench runs that introspect telemetry meters).
 */
export function nodeHandleFromInProcess(service: AztecNodeService): NodeHandle {
  return {
    client: service,
    service,
    stop: () => service.stop(),
  };
}
