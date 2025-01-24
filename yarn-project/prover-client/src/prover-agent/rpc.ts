import { ProverAgentApiSchema, type ProvingJobSource, ProvingJobSourceSchema } from '@aztec/circuit-types';
import { createSafeJsonRpcClient } from '@aztec/foundation/json-rpc/client';
import { createTracedJsonRpcServer, makeTracedFetch } from '@aztec/telemetry-client';

import { type ProverAgent } from './prover-agent.js';

export function createProvingJobSourceServer(queue: ProvingJobSource) {
  return createTracedJsonRpcServer(queue, ProvingJobSourceSchema);
}

export function createProvingJobSourceClient(url: string, fetch = makeTracedFetch([1, 2, 3], false)): ProvingJobSource {
  return createSafeJsonRpcClient(url, ProvingJobSourceSchema, false, 'provingJobSource', fetch);
}

/**
 * Wrap a ProverAgent instance with a JSON RPC HTTP server.
 * @param agent - The Prover Agent
 * @returns An JSON-RPC HTTP server
 */
export function createProverAgentRpcServer(agent: ProverAgent) {
  return createTracedJsonRpcServer(agent, ProverAgentApiSchema);
}
