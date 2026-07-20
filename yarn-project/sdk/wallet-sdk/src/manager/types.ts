import type { ChainInfo } from '@aztec/aztec.js/account';
import type { Wallet } from '@aztec/aztec.js/wallet';

/**
 * A pending connection that requires user verification before finalizing.
 *
 * After key exchange, both dApp and wallet compute a verification hash independently.
 * The dApp should display this hash (typically as emojis) and let the user confirm
 * it matches what's shown in their wallet before calling `confirm()`.
 *
 * This protects the dApp from connecting to a malicious wallet that might be
 * intercepting the connection (MITM attack).
 */
export interface PendingConnection {
  /**
   * The verification hash computed from the shared secret.
   * Use `hashToEmoji()` to convert to a visual representation for user verification.
   * The user should confirm this matches what their wallet displays.
   */
  verificationHash: string;

  /**
   * Confirms the connection after user verifies the emojis match.
   * @returns The connected wallet instance
   */
  confirm(): Promise<Wallet>;

  /**
   * Cancels the pending connection.
   * Call this if the user indicates the emojis don't match.
   */
  cancel(): void;
}

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
export type WalletProviderType = 'extension' | 'web';

/**
 * Callback type for wallet disconnect events at the provider level.
 */
export type ProviderDisconnectionCallback = () => void;

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
   * Establishes a secure channel with this wallet provider.
   *
   * This performs the ECDH key exchange and returns a pending connection with the
   * verification hash. The channel is encrypted but NOT yet verified - the dApp
   * should display the hash (as emojis) to the user and let them confirm it
   * matches their wallet before calling `confirm()`.
   *
   * @param appId - Application identifier for the requesting dapp
   * @param options - Optional provider-specific options (e.g. container element for iframe wallets)
   * @returns A pending connection with verification hash and confirm/cancel methods
   *
   * @example
   * ```typescript
   * const pending = await provider.establishSecureChannel('my-app');
   *
   * // Show emojis to user for verification
   * const emojis = hashToEmoji(pending.verificationHash);
   * showDialog(`Verify these match your wallet: ${emojis}`);
   *
   * // User confirms emojis match
   * const wallet = await pending.confirm();
   * ```
   */
  establishSecureChannel(appId: string, options?: Record<string, unknown>): Promise<PendingConnection>;
  /**
   * Disconnects the current wallet and cleans up resources.
   * After calling this, the wallet returned from confirm() should no longer be used.
   * @returns A promise that resolves when disconnection is complete
   */
  disconnect(): Promise<void>;
  /**
   * Registers a callback to be invoked when the wallet disconnects unexpectedly.
   * @param callback - Function to call when wallet disconnects
   * @returns A function to unregister the callback
   */
  onDisconnect(callback: ProviderDisconnectionCallback): () => void;
  /**
   * Returns whether the provider's wallet connection has been disconnected.
   * @returns true if the wallet is no longer connected
   */
  isDisconnected(): boolean;
}

/**
 * Options for discovering wallets
 */
export interface DiscoverWalletsOptions {
  /** Chain information to filter by */
  chainInfo: ChainInfo;
  /** Application ID making the request */
  appId: string;
  /** Discovery timeout in milliseconds. Default: 60000 (60s) */
  timeout?: number;
  /**
   * Callback invoked when a wallet provider is discovered.
   * Use this to show wallets to users as they approve them, rather than
   * waiting for the full timeout.
   */
  onWalletDiscovered?: (provider: WalletProvider) => void;
}

/**
 * A cancellable discovery session.
 *
 * Returned by `WalletManager.getAvailableWallets()` to allow consumers to
 * cancel discovery when no longer needed (e.g., network changes, user navigates away).
 *
 * @example
 * ```typescript
 * const discovery = WalletManager.configure({...}).getAvailableWallets({...});
 *
 * // Iterate over discovered wallets
 * for await (const wallet of discovery.wallets) {
 *   console.log(`Found: ${wallet.name}`);
 * }
 *
 * // Cancel discovery when no longer needed
 * discovery.cancel();
 * ```
 */
export interface DiscoverySession {
  /** Async iterator that yields wallet providers as they're discovered */
  wallets: AsyncIterable<WalletProvider>;
  /** Promise that resolves when discovery completes or is cancelled */
  done: Promise<void>;
  /** Cancel discovery immediately and clean up resources */
  cancel: () => void;
}
