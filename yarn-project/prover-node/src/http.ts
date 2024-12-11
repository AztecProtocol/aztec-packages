import { ProverNodeApiSchema } from '@aztec/circuit-types';
import { createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';

import { type ProverNode } from './prover-node.js';

/**
 * Wrap a ProverNode instance with a JSON RPC HTTP server.
 * @param node - The ProverNode
 * @returns An JSON-RPC HTTP server
 */
export function createProverNodeRpcServer(node: ProverNode) {
  return createSafeJsonRpcServer(node, ProverNodeApiSchema);
}
