import type { Wallet } from '@aztec/aztec.js/wallet';
import { WalletSchema } from '@aztec/aztec.js/wallet';
import { createSafeJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';

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
