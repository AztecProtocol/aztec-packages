import type { Wallet } from '@aztec/aztec.js';

export const EVENT_PREFIX = '@aztec/wallet:discovery';
export const WALLET_ANNOUNCE_EVENT_TYPE = `${EVENT_PREFIX}:announce` as const;
export const WALLET_REQUEST_EVENT_TYPE = `${EVENT_PREFIX}:request` as const;

interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

export type WalletWithMetadata = {
  info: EIP6963ProviderInfo;
  provider: Wallet;
};
