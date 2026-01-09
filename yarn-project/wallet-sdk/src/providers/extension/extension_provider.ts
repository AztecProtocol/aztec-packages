import type { ChainInfo } from '@aztec/aztec.js/account';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { deriveSharedKey, exportPublicKey, generateKeyPair, hashSharedSecret, importPublicKey } from '../../crypto.js';
import type { DiscoveryRequest, DiscoveryResponse, WalletInfo } from '../../types.js';

/**
 * A discovered wallet with its secure channel components.
 * Returned by {@link ExtensionProvider.discoverExtensions}.
 */
export interface DiscoveredWallet {
  /** Basic wallet information (id, name, icon, version, publicKey, verificationHash) */
  info: WalletInfo;
  /** The MessagePort for private communication with the wallet */
  port: MessagePort;
  /** The derived AES-256-GCM shared key for encryption */
  sharedKey: CryptoKey;
}

/**
 * Internal type for discovery response with MessagePort
 * @internal
 */
interface DiscoveryResponseWithPort extends DiscoveryResponse {
  /** The MessagePort transferred from the wallet */
  port?: MessagePort;
}

/**
 * Provider for discovering Aztec wallet extensions.
 *
 * This class handles the discovery phase of wallet communication:
 * 1. Broadcasts a discovery request with the dApp's public key
 * 2. Receives responses from installed wallets with their public keys
 * 3. Derives shared secrets and computes verification hashes
 * 4. Returns discovered wallets with their secure channel components
 *
 * @example
 * ```typescript
 * const wallets = await ExtensionProvider.discoverExtensions(chainInfo);
 * // Display wallets to user with optional emoji verification
 * for (const wallet of wallets) {
 *   const emoji = hashToEmoji(wallet.info.verificationHash!);
 *   console.log(`${wallet.info.name}: ${emoji}`);
 * }
 * // User selects a wallet after verifying
 * const wallet = await ExtensionWallet.create(wallets[0], chainInfo, 'my-app');
 * ```
 */
export class ExtensionProvider {
  private static discoveryInProgress = false;

  /**
   * Discovers all installed Aztec wallet extensions and establishes secure channel components.
   *
   * This method:
   * 1. Generates an ECDH key pair for this discovery session
   * 2. Broadcasts a discovery request with the dApp's public key
   * 3. Receives responses from wallets with their public keys and MessagePorts
   * 4. Derives shared secrets and computes verification hashes
   *
   * @param chainInfo - Chain information to check if extensions support this network
   * @param timeout - How long to wait for extensions to respond (ms)
   * @returns Array of discovered wallets with their secure channel components
   *
   * @example
   * ```typescript
   * const wallets = await ExtensionProvider.discoverExtensions({
   *   chainId: Fr(31337),
   *   version: Fr(0)
   * });
   * // Access wallet info and secure channel
   * const { info, port, sharedKey } = wallets[0];
   * ```
   */
  static async discoverExtensions(chainInfo: ChainInfo, timeout: number = 1000): Promise<DiscoveredWallet[]> {
    // If discovery is already in progress, wait and return empty
    // (caller should retry or handle appropriately)
    if (this.discoveryInProgress) {
      await new Promise(resolve => setTimeout(resolve, timeout));
      return [];
    }

    this.discoveryInProgress = true;

    // Generate key pair for this discovery session
    const keyPair = await generateKeyPair();
    const exportedPublicKey = await exportPublicKey(keyPair.publicKey);

    const { promise, resolve } = promiseWithResolvers<DiscoveredWallet[]>();
    const requestId = globalThis.crypto.randomUUID();
    const responses: DiscoveredWallet[] = [];

    // Set up listener for discovery responses
    const handleMessage = async (event: MessageEvent) => {
      if (event.source !== window) {
        return;
      }

      let data: DiscoveryResponseWithPort;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === 'aztec-wallet-discovery-response' && data.requestId === requestId) {
        // Get the MessagePort from the event
        const port = event.ports?.[0];
        if (!port) {
          return;
        }

        // Derive shared key from wallet's public key
        const walletPublicKey = data.walletInfo.publicKey;
        if (!walletPublicKey) {
          return;
        }

        try {
          const importedWalletKey = await importPublicKey(walletPublicKey);
          const sharedKey = await deriveSharedKey(keyPair.privateKey, importedWalletKey);

          // Compute verification hash
          const verificationHash = await hashSharedSecret(sharedKey);

          // Create wallet info with verification hash
          const walletInfo: WalletInfo = {
            ...data.walletInfo,
            verificationHash,
          };

          responses.push({
            info: walletInfo,
            port,
            sharedKey,
          });
        } catch {
          // Failed to derive key, skip this wallet
        }
      }
    };

    window.addEventListener('message', handleMessage);

    // Send discovery message with our public key
    const discoveryMessage: DiscoveryRequest = {
      type: 'aztec-wallet-discovery',
      requestId,
      chainInfo,
      publicKey: exportedPublicKey,
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
