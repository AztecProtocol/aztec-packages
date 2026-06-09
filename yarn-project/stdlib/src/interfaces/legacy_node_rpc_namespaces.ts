import type { NamespacedApiHandlers } from '@aztec/foundation/json-rpc/server';

/**
 * Registers legacy `node_*`, `nodeAdmin_*`, and `nodeDebug_*` JSON-RPC namespaces as aliases of the `aztec_*` handlers.
 */
export function addLegacyNodeRpcNamespaces(
  services: NamespacedApiHandlers,
  adminServices?: NamespacedApiHandlers,
): void {
  if (services.aztec) {
    services.node = services.aztec;
  }
  if (services.aztecDebug) {
    services.nodeDebug = services.aztecDebug;
  }
  if (adminServices?.aztecAdmin) {
    adminServices.nodeAdmin = adminServices.aztecAdmin;
  }
}
