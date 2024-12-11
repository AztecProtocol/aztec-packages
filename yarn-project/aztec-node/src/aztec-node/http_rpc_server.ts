import { type AztecNode, AztecNodeApiSchema } from '@aztec/circuit-types';
import { createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';

/**
 * Wrap an AztecNode instance with a JSON RPC HTTP server.
 * @param node - The AztecNode
 * @returns An JSON-RPC HTTP server
 */
export function createAztecNodeRpcServer(node: AztecNode) {
  return createSafeJsonRpcServer(node, AztecNodeApiSchema);
}
