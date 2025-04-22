import type {
  Account,
  Chain,
  Client,
  FallbackTransport,
  HttpTransport,
  PublicActions,
  PublicClient,
  PublicRpcSchema,
  WalletActions,
  WalletClient,
  WalletRpcSchema,
} from 'viem';

/** Type for a viem public client */
export type ViemPublicClient = PublicClient<FallbackTransport<HttpTransport[]>, Chain>;

export type SimpleViemWalletClient = WalletClient<FallbackTransport<HttpTransport[]>, Chain, Account>;

export type ExtendedViemWalletClient = Client<
  FallbackTransport<readonly HttpTransport[]>,
  Chain,
  Account,
  [...PublicRpcSchema, ...WalletRpcSchema],
  PublicActions<FallbackTransport<readonly HttpTransport[]>, Chain> & WalletActions<Chain, Account>
>;

export type ViemWalletClient = SimpleViemWalletClient | ExtendedViemWalletClient;

export type L1Clients = {
  publicClient: ViemPublicClient;
  walletClient: ExtendedViemWalletClient;
};
