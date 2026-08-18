import { type AztecNode, type AztecNodeClientOptions, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';

/** Returns a provided node or creates a JSON-RPC client for a node URL. */
export function resolveAztecNode(nodeOrUrl: string | AztecNode, nodeClientOptions?: AztecNodeClientOptions): AztecNode {
  return typeof nodeOrUrl === 'string' ? createAztecNodeClient(nodeOrUrl, nodeClientOptions) : nodeOrUrl;
}
