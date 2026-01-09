import { ExtensionProvider, ExtensionWallet } from '../providers/extension/index.js';
import type { DiscoverWalletsOptions, ExtensionWalletConfig, WalletManagerConfig, WalletProvider } from './types.js';

/**
 * Manager for wallet discovery, configuration, and connection
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
   * Only returns wallets that support the requested chain and version.
   * @param options - Discovery options including chain info and timeout
   * @returns Array of wallet providers with baked-in chain info
   */
  async getAvailableWallets(options: DiscoverWalletsOptions): Promise<WalletProvider[]> {
    const providers: WalletProvider[] = [];
    const { chainInfo } = options;

    if (this.config.extensions?.enabled) {
      const discoveredWallets = await ExtensionProvider.discoverExtensions(chainInfo, options.timeout);
      const extensionConfig = this.config.extensions;

      for (const { info, port, sharedKey } of discoveredWallets) {
        if (!this.isExtensionAllowed(info.id, extensionConfig)) {
          continue;
        }

        providers.push({
          id: info.id,
          type: 'extension',
          name: info.name,
          icon: info.icon,
          metadata: {
            version: info.version,
            verificationHash: info.verificationHash,
          },
          connect: (appId: string) => ExtensionWallet.create(info, chainInfo, port, sharedKey, appId),
        });
      }
    }

    // TODO: Add web wallet discovery when implemented

    return providers;
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
