import type { ChainInfo } from '@aztec/aztec.js/account';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import type { DiscoveryRequest, DiscoveryResponse, WalletInfo } from '../types.js';

/**
 * Provider for discovering and managing Aztec wallet extensions
 */
export class ExtensionProvider {
  private static discoveredExtensions: Map<string, WalletInfo> = new Map();
  private static discoveryInProgress = false;

  /**
   * Discovers all installed Aztec wallet extensions
   * @param chainInfo - Chain information to check if extensions support this network
   * @param timeout - How long to wait for extensions to respond (ms)
   * @returns Array of discovered extension information
   */
  static async discoverExtensions(chainInfo: ChainInfo, timeout: number = 1000): Promise<WalletInfo[]> {
    // If discovery is in progress, wait for it to complete
    if (this.discoveryInProgress) {
      await new Promise(resolve => setTimeout(resolve, timeout));
      return Array.from(this.discoveredExtensions.values());
    }

    this.discoveryInProgress = true;
    this.discoveredExtensions.clear();

    const { promise, resolve } = promiseWithResolvers<WalletInfo[]>();
    const requestId = globalThis.crypto.randomUUID();
    const responses: WalletInfo[] = [];

    // Set up listener for discovery responses
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      let data: DiscoveryResponse;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'aztec-wallet-discovery-response' && data.requestId === requestId) {
        responses.push(data.walletInfo);
        this.discoveredExtensions.set(data.walletInfo.id, data.walletInfo);
      }
    };

    window.addEventListener('message', handleMessage);

    // Send discovery message
    const discoveryMessage: DiscoveryRequest = {
      type: 'aztec-wallet-discovery',
      requestId,
      chainInfo,
    };
    window.postMessage(jsonStringify(discoveryMessage), '*');

    // Wait for responses
    setTimeout(() => {
      window.removeEventListener('message', handleMessage);
      this.discoveryInProgress = false;
      resolve(responses);
    }, timeout);

    return promise;
  }
}
