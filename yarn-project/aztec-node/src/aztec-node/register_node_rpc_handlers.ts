import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';
import { AztecNodeAdminApiSchema, AztecNodeApiSchema, AztecNodeDebugApiSchema } from '@aztec/stdlib/interfaces/client';
import { P2PApiSchema } from '@aztec/stdlib/interfaces/server';

import type { AztecNodeService } from './server.js';

/**
 * Registers the Aztec node RPC handlers (`aztec_*`, `aztecAdmin_*`, and optionally `aztecDebug_*`), along with the
 * legacy pre-v5 namespaces (`node_*`, `nodeAdmin_*`, `nodeDebug_*`, `p2p_*`) for backwards compatibility.
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
  services.p2p = [node.getP2P(), P2PApiSchema];
  if (adminServices) {
    adminServices.aztecAdmin = [node, AztecNodeAdminApiSchema];
    adminServices.nodeAdmin = adminServices.aztecAdmin;
  }
  if (options.debug) {
    services.aztecDebug = [node, AztecNodeDebugApiSchema];
    services.nodeDebug = services.aztecDebug;
  }
}
