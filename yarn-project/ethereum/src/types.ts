import {
  type Chain,
  type Client,
  type HttpTransport,
  type PrivateKeyAccount,
  type PublicActions,
  type PublicRpcSchema,
  type WalletActions,
  type WalletRpcSchema,
} from 'viem';

/**
 * Type for a viem wallet and public client using a local private key.
 * Created as: `createWalletClient({ account: privateKeyToAccount(key), transport: http(url), chain }).extend(publicActions)`
 */
export type ViemClient = Client<
  HttpTransport,
  Chain,
  PrivateKeyAccount,
  [...PublicRpcSchema, ...WalletRpcSchema],
  PublicActions<HttpTransport, Chain> & WalletActions<Chain, PrivateKeyAccount>
>;
