import type { ChainInfo } from '@aztec/aztec.js/account';
import type { Wallet } from '@aztec/aztec.js/wallet';

/**
 * Configuration for extension wallets
 */
export interface ExtensionWalletConfig {
  /** Whether extension wallets are enabled */
  enabled: boolean;
  /** Optional list of allowed extension IDs (whitelist) */
  allowList?: string[];
  /** Optional list of blocked extension IDs (blacklist) */
  blockList?: string[];
}

/**
 * Configuration for web wallets
 */
export interface WebWalletConfig {
  /** URLs of web wallet services */
  urls: string[];
}

/**
 * Configuration for the WalletManager
 */
export interface WalletManagerConfig {
  /** Extension wallet configuration */
  extensions?: ExtensionWalletConfig;
  /** Web wallet configuration */
  webWallets?: WebWalletConfig;
}

/**
 * Type of wallet provider
 */
export type WalletProviderType = 'extension' | 'web' | 'embedded';

/**
 * A wallet provider that can connect to create a wallet instance.
 * Chain information is already baked in from the discovery process.
 */
export interface WalletProvider {
  /** Unique identifier for the provider */
  id: string;
  /** Type of wallet provider */
  type: WalletProviderType;
  /** Display name */
  name: string;
  /** Icon URL */
  icon?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /**
   * Connect to this wallet provider with an application ID
   * @param appId - Application identifier for the requesting dapp
   */
  connect(appId: string): Promise<Wallet>;
}

/**
 * Options for discovering wallets
 */
export interface DiscoverWalletsOptions {
  /** Chain information to filter by */
  chainInfo: ChainInfo;
  /** Discovery timeout in milliseconds */
  timeout?: number;
}
