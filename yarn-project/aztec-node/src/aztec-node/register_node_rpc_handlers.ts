import type { NamespacedApiHandlers, StatusCheckFn } from '@aztec/foundation/json-rpc/server';
import { AztecNodeAdminApiSchema, AztecNodeApiSchema, AztecNodeDebugApiSchema } from '@aztec/stdlib/interfaces/client';
import { type P2PApi, P2PApiSchema } from '@aztec/stdlib/interfaces/server';

import type { AztecNodeService } from './server.js';

/**
 * Health check for the p2p component: reports whether p2p is enabled and how many peers are connected, and fails
 * when p2p is enabled but connected to fewer peers than the given minimum. A minimum of zero never fails.
 */
function makeP2PHealthCheck(p2p: P2PApi, minPeers: number): StatusCheckFn {
  return async () => {
    const { enabled, connectedPeers } = await p2p.getP2PConnectivity();
    return { healthy: !enabled || connectedPeers >= minPeers, details: { enabled, connectedPeers } };
  };
}

/**
 * Registers the Aztec node RPC handlers (`aztec_*`, `aztecAdmin_*`, and optionally `aztecDebug_*`), along with the
 * legacy pre-v5 namespaces (`node_*`, `nodeAdmin_*`, `nodeDebug_*`, `p2p_*`) for backwards compatibility.
 */
// TODO: Legacy support for node, nodeAdmin, nodeDebug, p2p namespaces. New namespaces introduced in v5. Remove on future release. A-1169
export function registerAztecNodeRpcHandlers(
  node: AztecNodeService,
  services: NamespacedApiHandlers,
  adminServices?: NamespacedApiHandlers,
  options: { debug?: boolean; p2pHealthMinPeers?: number } = {},
): void {
  const p2p = node.getP2P();
  services.aztec = [node, AztecNodeApiSchema];
  services.node = services.aztec;
  services.p2p = [p2p, P2PApiSchema, makeP2PHealthCheck(p2p, options.p2pHealthMinPeers ?? 0)];
  if (adminServices) {
    adminServices.aztecAdmin = [node, AztecNodeAdminApiSchema];
    adminServices.nodeAdmin = adminServices.aztecAdmin;
  }
  if (options.debug) {
    services.aztecDebug = [node, AztecNodeDebugApiSchema];
    services.nodeDebug = services.aztecDebug;
  }
}
