import type {
  Account,
  Chain,
  Client,
  FallbackTransport,
  HttpTransport,
  PrivateKeyAccount,
  PublicActions,
  PublicClient,
  PublicRpcSchema,
  WalletActions,
  WalletClient,
  WalletRpcSchema,
} from 'viem';

/** Type for a viem public client */
export type ViemPublicClient = PublicClient<FallbackTransport<HttpTransport[]>, Chain>;

export type ViemWalletClient = WalletClient<FallbackTransport<HttpTransport[]>, Chain, Account>;

export type ExtendedViemWalletClient = Client<
  FallbackTransport<HttpTransport[]>,
  Chain,
  PrivateKeyAccount,
  [...PublicRpcSchema, ...WalletRpcSchema],
  PublicActions<FallbackTransport<HttpTransport[]>, Chain> & WalletActions<Chain, PrivateKeyAccount>
>;

export type L1Clients = {
  publicClient: ViemPublicClient;
  walletClient: ExtendedViemWalletClient;
};
