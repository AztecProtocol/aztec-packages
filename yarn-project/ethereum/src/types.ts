import {
  type Account,
  type Chain,
  type FallbackTransport,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
} from 'viem';

/** Type for a viem public client */
export type ViemPublicClient = PublicClient<FallbackTransport<HttpTransport[]>, Chain>;

export type ViemWalletClient = WalletClient<FallbackTransport<HttpTransport[]>, Chain, Account>;

export type L1Clients = {
  publicClient: ViemPublicClient;
  walletClient: ViemWalletClient;
};
