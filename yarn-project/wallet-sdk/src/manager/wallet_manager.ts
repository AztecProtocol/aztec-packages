import type { ChainInfo } from '@aztec/aztec.js/account';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { type DiscoveredWallet, ExtensionProvider, ExtensionWallet } from '../extension/provider/index.js';
import { WalletMessageType } from '../types.js';
import type {
  DiscoverWalletsOptions,
  DiscoverySession,
  ExtensionWalletConfig,
  PendingConnection,
  ProviderDisconnectionCallback,
  WalletManagerConfig,
  WalletProvider,
} from './types.js';

/**
 * Manager for wallet discovery, configuration, and connection.
 *
 * This is the main entry point for dApps to discover and connect to wallets.
 *
 * @example Basic usage with async iterator
 * ```typescript
 * const discovery = WalletManager.configure({ extensions: { enabled: true } })
 *   .getAvailableWallets({ chainInfo, appId: 'my-app' });
 *
 * // Iterate over discovered wallets
 * for await (const provider of discovery.wallets) {
 *   console.log(`Found wallet: ${provider.name}`);
 * }
 *
 * // Or cancel early when done
 * discovery.cancel();
 * ```
 *
 * @example With callback for discovered wallets
 * ```typescript
 * const discovery = manager.getAvailableWallets({
 *   chainInfo,
 *   appId: 'my-app',
 *   onWalletDiscovered: (provider) => console.log(`Found: ${provider.name}`),
 * });
 *
 * // Wait for discovery to complete or cancel it
 * await discovery.done;
 * ```
 */
export class WalletManager {
  private config: WalletManagerConfig = {
    extensions: { enabled: true },
    webWallets: { urls: [] },
  };

  private constructor() {}

  /**
   * Configures the WalletManager with provider settings
   * @param config - Configuration options for wallet providers
   */
  static configure(config: WalletManagerConfig): WalletManager {
    const instance = new WalletManager();
    instance.config = {
      extensions: config.extensions ?? { enabled: true },
      webWallets: config.webWallets ?? { urls: [] },
    };
    return instance;
  }

  /**
   * Discovers all available wallets for a given chain and version.
   *
   * Returns a `DiscoverySession` with:
   * - `wallets`: AsyncIterable to iterate over discovered wallets
   * - `done`: Promise that resolves when discovery completes or is cancelled
   * - `cancel()`: Function to stop discovery immediately
   *
   * If `onWalletDiscovered` callback is provided, wallets are also streamed via callback.
   *
   * @param options - Discovery options including chain info, appId, and timeout
   * @returns A cancellable discovery session
   */
  getAvailableWallets(options: DiscoverWalletsOptions): DiscoverySession {
    const { chainInfo, appId } = options;
    const abortController = new AbortController();

    const pendingProviders: WalletProvider[] = [];
    let pendingResolve: ((result: IteratorResult<WalletProvider>) => void) | null = null;
    let completed = false;

    const { promise: donePromise, resolve: resolveDone } = promiseWithResolvers<void>();

    const markComplete = () => {
      completed = true;
      resolveDone();
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = null;
        resolve({ value: undefined, done: true });
      }
    };

    if (this.config.extensions?.enabled) {
      const extensionConfig = this.config.extensions;

      void ExtensionProvider.discoverWallets(chainInfo, {
        appId,
        timeout: options.timeout,
        signal: abortController.signal,
        onWalletDiscovered: discoveredWallet => {
          const provider = this.createProviderFromDiscoveredWallet(discoveredWallet, chainInfo, extensionConfig);
          if (!provider) {
            return;
          }

          // Call user's callback if provided
          options.onWalletDiscovered?.(provider);

          // Also queue for async iterator
          if (pendingResolve) {
            const resolve = pendingResolve;
            pendingResolve = null;
            resolve({ value: provider, done: false });
          } else {
            pendingProviders.push(provider);
          }
        },
      }).then(markComplete);
    } else {
      markComplete();
    }

    const wallets: AsyncIterable<WalletProvider> = {
      // eslint-disable-next-line jsdoc/require-jsdoc
      [Symbol.asyncIterator](): AsyncIterator<WalletProvider> {
        return {
          // eslint-disable-next-line jsdoc/require-jsdoc
          next(): Promise<IteratorResult<WalletProvider>> {
            if (pendingProviders.length > 0) {
              return Promise.resolve({ value: pendingProviders.shift()!, done: false });
            }

            if (completed) {
              return Promise.resolve({ value: undefined, done: true });
            }

            return new Promise(resolve => {
              pendingResolve = resolve;
            });
          },
        };
      },
    };

    return {
      wallets,
      done: donePromise,
      cancel: () => abortController.abort(),
    };
  }

  /**
   * Creates a WalletProvider from a discovered wallet.
   * Returns null if the wallet is not allowed by config.
   * @param discoveredWallet - The discovered wallet from extension discovery.
   * @param chainInfo - Network information.
   * @param extensionConfig - Extension wallet configuration.
   */
  private createProviderFromDiscoveredWallet(
    discoveredWallet: DiscoveredWallet,
    chainInfo: ChainInfo,
    extensionConfig: ExtensionWalletConfig,
  ): WalletProvider | null {
    const { info } = discoveredWallet;

    if (!this.isExtensionAllowed(info.id, extensionConfig)) {
      return null;
    }

    let extensionWallet: ExtensionWallet | null = null;

    const provider: WalletProvider = {
      id: info.id,
      type: 'extension',
      name: info.name,
      icon: info.icon,
      metadata: {
        version: info.version,
      },
      establishSecureChannel: async (connectAppId: string): Promise<PendingConnection> => {
        const connection = await discoveredWallet.establishSecureChannel();

        provider.metadata = {
          ...provider.metadata,
          verificationHash: connection.info.verificationHash,
        };

        return {
          verificationHash: connection.info.verificationHash!,
          confirm: () => {
            return Promise.resolve(
              ExtensionWallet.create(
                connection.info.id,
                connection.port,
                connection.sharedKey,
                chainInfo,
                connectAppId,
              ),
            );
          },
          cancel: () => {
            // Send disconnect to terminate the session on the extension side
            // but keep the port open so we can retry key exchange
            connection.port.postMessage({
              type: WalletMessageType.DISCONNECT,
              requestId: discoveredWallet.requestId,
            });
            // Don't close the port - allow retry with fresh key exchange
          },
        };
      },
      disconnect: async () => {
        if (extensionWallet) {
          await extensionWallet.disconnect();
          extensionWallet = null;
        }
      },
      onDisconnect: (callback: ProviderDisconnectionCallback) => {
        if (extensionWallet) {
          return extensionWallet.onDisconnect(callback);
        }
        return () => {};
      },
      isDisconnected: () => {
        if (extensionWallet) {
          return extensionWallet.isDisconnected();
        }
        return true;
      },
    };

    return provider;
  }

  /**
   * Checks if an extension is allowed based on allow/block lists
   * @param extensionId - The extension ID to check
   * @param config - Extension wallet configuration containing allow/block lists
   */
  private isExtensionAllowed(extensionId: string, config: ExtensionWalletConfig): boolean {
    if (config.blockList && config.blockList.includes(extensionId)) {
      return false;
    }

    if (config.allowList && config.allowList.length > 0) {
      return config.allowList.includes(extensionId);
    }

    return true;
  }
}
