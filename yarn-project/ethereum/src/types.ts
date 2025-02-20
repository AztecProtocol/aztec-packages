import type {
  Chain,
  Client,
  HttpTransport,
  PrivateKeyAccount,
  PublicActions,
  PublicClient,
  PublicRpcSchema,
  WalletActions,
  WalletRpcSchema,
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

/** Type for a viem public client */
export type ViemPublicClient = PublicClient<HttpTransport, Chain>;

/** Both L1 clients */
export type L1Clients = {
  publicClient: ViemPublicClient;
  walletClient: ViemClient;
};
