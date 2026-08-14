import { type AztecNode, createAztecNodeClient } from '@aztec/stdlib/interfaces/client';

import type { EmbeddedWalletOptions } from '../embedded_wallet.js';

/** Returns a provided node or creates a JSON-RPC client for a node URL. */
export function resolveAztecNode(
  nodeOrUrl: string | AztecNode,
  nodeClientOptions?: EmbeddedWalletOptions['nodeClientOptions'],
): AztecNode {
  return typeof nodeOrUrl === 'string'
    ? createAztecNodeClient(
        nodeOrUrl,
        {},
        nodeClientOptions?.fetch,
        0,
        nodeClientOptions?.maxBatchSize,
        nodeClientOptions?.fetchOptions,
      )
    : nodeOrUrl;
}
