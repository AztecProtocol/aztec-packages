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
  WalletRpcSchema,
} from 'viem';

/** Type for a viem public client */
export type ViemPublicClient = PublicClient<FallbackTransport<HttpTransport[]>, Chain>;

export type ExtendedViemWalletClient = Client<
  FallbackTransport<readonly HttpTransport[]>,
  Chain,
  Account,
  [...PublicRpcSchema, ...WalletRpcSchema],
  PublicActions<FallbackTransport<readonly HttpTransport[]>, Chain> & WalletActions<Chain, Account>
>;

/** Type for a viem client that can be either public or extended with wallet capabilities */
export type ViemClient = ViemPublicClient | ExtendedViemWalletClient;

/** Type for a viem contract that can be used with an extended viem client */
export type ViemContract<TAbi extends Abi> = GetContractReturnType<TAbi, ExtendedViemWalletClient>;

export function isExtendedClient(client: ViemClient): client is ExtendedViemWalletClient {
  return 'account' in client && client.account !== undefined;
}
