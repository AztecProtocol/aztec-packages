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

    // Discover extension wallets
    if (this.config.extensions?.enabled) {
      const extensions = await ExtensionProvider.discoverExtensions(chainInfo, options.timeout);
      const extensionConfig = this.config.extensions;

      for (const ext of extensions) {
        // Apply allow/block lists
        if (!this.isExtensionAllowed(ext.id, extensionConfig)) {
          continue;
        }

        providers.push({
          id: ext.id,
          type: 'extension',
          name: ext.name,
          icon: ext.icon,
          metadata: {
            version: ext.version,
          },
          connect: (appId: string) => Promise.resolve(ExtensionWallet.create(chainInfo, appId, ext.id)),
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
    // Check block list first
    if (config.blockList && config.blockList.includes(extensionId)) {
      return false;
    }

    // If allow list exists, extension must be in it
    if (config.allowList && config.allowList.length > 0) {
      return config.allowList.includes(extensionId);
    }

    // If no allow list, extension is allowed (unless blocked)
    return true;
  }
}
