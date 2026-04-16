import { createSafeJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';

import type { Wallet } from './wallet.js';
import { WalletSchema } from './wallet.js';

/**
 * Creates a JSON-RPC client that connects to a remote wallet service.
 * The returned object implements the {@link Wallet} interface, proxying all calls over HTTP to the specified URL.
 */
export function createWalletClient(url: string): Wallet {
  return createSafeJsonRpcClient<Wallet>(url, WalletSchema, {
    namespaceMethods: 'wallet',
    fetch: makeFetch([1, 2, 3], false),
  });
}
