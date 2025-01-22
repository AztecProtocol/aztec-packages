import { type PXE, PXESchema } from '@aztec/circuit-types/interfaces';
import { createSafeJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';

/**
 * Creates a JSON-RPC client to remotely talk to PXE.
 * @param url - The URL of the PXE.
 * @param fetch - The fetch implementation to use.
 * @returns A JSON-RPC client of PXE.
 */
export function createPXEClient(url: string, fetch = makeFetch([1, 2, 3], false)): PXE {
  return createSafeJsonRpcClient<PXE>(url, PXESchema, false, 'pxe', fetch);
}
