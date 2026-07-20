import type { ChainInfo } from '@aztec/aztec.js/account';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { promiseWithResolvers } from '@aztec/foundation/promise';

import { deriveSessionKeys, exportPublicKey, generateKeyPair, importPublicKey } from '../../crypto.js';
import {
  type ConnectedWalletInfo,
  type DiscoveryRequest,
  type DiscoveryResponse,
  type KeyExchangeRequest,
  type KeyExchangeResponse,
  type WalletInfo,
  WalletMessageType,
} from '../../types.js';

/** Default discovery timeout - long to give users time to approve */
const DEFAULT_DISCOVERY_TIMEOUT_MS = 60000; // 60 seconds

/** Key exchange timeout - short, wallet should respond quickly after discovery approval */
const KEY_EXCHANGE_TIMEOUT_MS = 2000; // 2 seconds

/**
 * A discovered wallet before key exchange.
 * Has basic info and MessagePort, but no shared key yet.
 *
 * Call {@link establishSecureChannel} to perform key exchange and get a connected wallet.
 */
export class DiscoveredWallet {
  constructor(
    /** Basic wallet information (id, name, icon, version) */
    public readonly info: WalletInfo,
    /** The MessagePort for private communication with the wallet */
    public readonly port: MessagePort,
    /** Request ID for correlation */
    public readonly requestId: string,
  ) {}

  /**
   * Establishes a secure connection with this wallet.
   *
   * This method:
   * 1. Generates an ECDH key pair
   * 2. Sends public key to wallet over the MessagePort
   * 3. Receives wallet's public key
   * 4. Derives shared secret and computes verification hash locally
   *
   * **IMPORTANT**: Has a 2 second timeout for MITM defense.
   * Both parties must exchange keys relatively quickly.
   *
   * The verification hash is computed independently by both parties
   * and should be displayed to the user for visual comparison.
   *
   * @returns Connected wallet with shared key and verification hash
   * @throws Error if key exchange fails or times out
   */
  async establishSecureChannel(): Promise<ConnectedWallet> {
    const keyPair = await generateKeyPair();
    const exportedPublicKey = await exportPublicKey(keyPair.publicKey);

    const { promise, resolve, reject } = promiseWithResolvers<ConnectedWallet>();

    const timeoutId = setTimeout(() => {
      reject(new Error('Key exchange timeout'));
    }, KEY_EXCHANGE_TIMEOUT_MS);

    this.port.onmessage = async (event: MessageEvent) => {
      const data = event.data as KeyExchangeResponse;

      if (data.type === WalletMessageType.KEY_EXCHANGE_RESPONSE && data.requestId === this.requestId) {
        clearTimeout(timeoutId);

        try {
          const walletPublicKey = await importPublicKey(data.publicKey);
          const session = await deriveSessionKeys(keyPair, walletPublicKey, true);

          const connectedInfo: ConnectedWalletInfo = {
            ...this.info,
            publicKey: data.publicKey,
            verificationHash: session.verificationHash,
          };

          resolve({
            info: connectedInfo,
            port: this.port,
            sharedKey: session.encryptionKey,
          });
        } catch (err) {
          reject(new Error(`Key exchange failed: ${err}`));
        }
      }
    };

    this.port.start();

    const keyExchangeRequest: KeyExchangeRequest = {
      type: WalletMessageType.KEY_EXCHANGE_REQUEST,
      requestId: this.requestId,
      publicKey: exportedPublicKey,
    };
    this.port.postMessage(keyExchangeRequest);

    return promise;
  }
}

/**
 * A fully connected wallet with secure channel established.
 * Available after key exchange completes.
 */
export interface ConnectedWallet {
  /** Full wallet info including public key and verification hash */
  info: ConnectedWalletInfo;
  /** The MessagePort for encrypted communication */
  port: MessagePort;
  /** The derived AES-256-GCM shared key for encryption */
  sharedKey: CryptoKey;
}

/**
 * Options for wallet discovery.
 */
export interface DiscoveryOptions {
  /** Application ID making the request */
  appId: string;
  /** How long to wait for user approval (ms). Default: 60000 (60s) */
  timeout?: number;
  /**
   * Callback invoked when a wallet is discovered.
   * Wallets are streamed as users approve them.
   */
  onWalletDiscovered?: (wallet: DiscoveredWallet) => void;
  /**
   * AbortSignal for cancelling discovery early.
   * When aborted, cleanup happens immediately instead of waiting for timeout.
   */
  signal?: AbortSignal;
}

/**
 * Provider for discovering Aztec wallet extensions.
 *
 * NOTE: Most users should use WalletManager instead of this class directly.
 * WalletManager provides a higher-level API with streaming support.
 *
 * The connection flow is split into two phases for security:
 *
 * 1. **Discovery Phase** ({@link discoverWallets}):
 *    - Broadcasts a discovery request (NO public keys)
 *    - Wallet shows pending request to user
 *    - User must approve before wallet reveals itself
 *    - Wallets are streamed via callback as they're approved
 *
 * 2. **Secure Channel Phase** ({@link DiscoveredWallet.establishSecureChannel}):
 *    - Performs ECDH key exchange over private MessageChannel
 *    - Both parties compute verification hash locally
 *    - Has a 2s timeout for MITM defense
 *    - Returns connected wallet with shared key and verification hash
 */
export class ExtensionProvider {
  /**
   * Discovers wallet extensions that user has approved.
   *
   * Wallets are streamed via the `onWalletDiscovered` callback as users approve them.
   * The promise resolves when the timeout expires or signal is aborted.
   *
   * @param chainInfo - Chain information to check if extensions support this network
   * @param options - Discovery options including appId, appName, timeout, and callback
   * @returns Promise that resolves when discovery completes
   */
  static discoverWallets(chainInfo: ChainInfo, options: DiscoveryOptions): Promise<void> {
    if (options.signal?.aborted) {
      return Promise.resolve();
    }
    const timeout = options.timeout ?? DEFAULT_DISCOVERY_TIMEOUT_MS;

    return new Promise(resolve => {
      const requestId = globalThis.crypto.randomUUID();
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let completed = false;

      const finish = () => {
        if (completed) {
          return;
        }
        completed = true;

        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
        window.removeEventListener('message', onMessage);
        options.signal?.removeEventListener('abort', onAbort);
        resolve();
      };

      const onAbort = () => finish();

      const onMessage = (event: MessageEvent) => {
        if (completed || event.source !== window) {
          return;
        }

        let data: DiscoveryResponse;
        try {
          data = JSON.parse(event.data);
        } catch {
          return;
        }

        if (data.type !== WalletMessageType.DISCOVERY_RESPONSE || data.requestId !== requestId) {
          return;
        }

        const port = event.ports?.[0];
        if (port) {
          options.onWalletDiscovered?.(new DiscoveredWallet(data.walletInfo, port, requestId));
        }
      };

      options.signal?.addEventListener('abort', onAbort, { once: true });
      window.addEventListener('message', onMessage);

      const discoveryMessage: DiscoveryRequest = {
        type: WalletMessageType.DISCOVERY,
        requestId,
        appId: options.appId,
        chainInfo,
      };
      window.postMessage(jsonStringify(discoveryMessage), '*');

      timeoutId = setTimeout(finish, timeout);
    });
  }
}
