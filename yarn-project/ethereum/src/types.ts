import type {
  Abi,
  Account,
  Chain,
  Client,
  FallbackTransport,
  GetContractReturnType,
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

/** Type for a viem client that can be either public or extended with wallet capabilities */
export type ViemClient = ViemPublicClient | ExtendedViemWalletClient;

export type L1Clients = {
  publicClient: ViemPublicClient;
  walletClient: ExtendedViemWalletClient;
};

export type ViemContract<TAbi extends Abi> = GetContractReturnType<TAbi, ExtendedViemWalletClient>;

export function isExtendedClient(client: ViemClient): client is ExtendedViemWalletClient {
  return 'account' in client;
}
