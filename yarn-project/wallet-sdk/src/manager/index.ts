export { WalletManager } from './wallet_manager.js';
export type {
  WalletManagerConfig,
  ExtensionWalletConfig,
  WebWalletConfig,
  WalletProviderType,
  WalletProvider,
  DiscoverWalletsOptions,
} from './types.js';

// Re-export types from providers for convenience
export type {
  WalletInfo,
  WalletMessage,
  WalletResponse,
  DiscoveryRequest,
  DiscoveryResponse,
} from '../providers/types.js';

// Re-export commonly needed utilities for wallet integration
export { ChainInfoSchema } from '@aztec/aztec.js/account';
export type { ChainInfo } from '@aztec/aztec.js/account';
export { WalletSchema } from '@aztec/aztec.js/wallet';
export { jsonStringify } from '@aztec/foundation/json-rpc';
