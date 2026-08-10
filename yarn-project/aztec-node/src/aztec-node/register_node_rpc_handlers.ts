import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { AztecNodeAdminApiSchema, AztecNodeApiSchema, AztecNodeDebugApiSchema } from '@aztec/stdlib/interfaces/client';
import { ArchiverApiSchema, P2PApiSchema } from '@aztec/stdlib/interfaces/server';

import type { AztecNodeService } from './server.js';

/**
 * Registers the Aztec node RPC handlers (`aztec_*`, `aztecAdmin_*`, and optionally `aztecDebug_*`), along with the
 * legacy pre-v5 namespaces (`node_*`, `nodeAdmin_*`, `nodeDebug_*`, `p2p_*`) for backwards compatibility.
 *
 * The read-only `archiver_*` namespace is registered whenever the node owns an archiver, so any node can act as
 * the upstream of a follower node without extra configuration. It exposes no capability the `aztec_*` namespace
 * does not already grant; it only returns the archiver's own domain objects instead of client-facing projections.
 *
 * The `p2p_*` namespace is skipped on nodes that run without a p2p stack (follower mode).
 */
// TODO: Legacy support for node, nodeAdmin, nodeDebug, p2p namespaces. New namespaces introduced in v5. Remove on future release. A-1169
export function registerAztecNodeRpcHandlers(
  node: AztecNodeService,
  services: NamespacedApiHandlers,
  adminServices?: NamespacedApiHandlers,
  options: { debug?: boolean } = {},
): void {
  services.aztec = [node, AztecNodeApiSchema];
  services.node = services.aztec;
  const p2p = node.tryGetP2P();
  if (p2p) {
    services.p2p = [p2p, P2PApiSchema];
  }
  const archiver = node.getArchiverApi();
  if (archiver) {
    services.archiver = [archiver, ArchiverApiSchema];
  }
  if (adminServices) {
    adminServices.aztecAdmin = [node, AztecNodeAdminApiSchema];
    adminServices.nodeAdmin = adminServices.aztecAdmin;
  }
  if (options.debug) {
    services.aztecDebug = [node, AztecNodeDebugApiSchema];
    services.nodeDebug = services.aztecDebug;
  }
}
