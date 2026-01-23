import type { ChainInfo } from '@aztec/aztec.js/account';
import { type Wallet, WalletSchema } from '@aztec/aztec.js/wallet';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { schemaHasMethod } from '@aztec/foundation/schemas';
import type { FunctionsOf } from '@aztec/foundation/types';

import { type EncryptedPayload, decrypt, encrypt } from '../../crypto.js';
import { type WalletInfo, type WalletMessage, WalletMessageType, type WalletResponse } from '../../types.js';

/**
 * Internal type representing a wallet method call before encryption.
 * @internal
 */
type WalletMethodCall = {
  /** The wallet method name to invoke */
  type: keyof FunctionsOf<Wallet>;
  /** Arguments to pass to the wallet method */
  args: unknown[];
};

/**
 * Callback type for wallet disconnect events.
 */
export type DisconnectCallback = () => void;

/**
 * A wallet implementation that communicates with browser extension wallets
 * using a secure encrypted MessageChannel.
 *
 * This class uses a pre-established secure channel from the discovery phase:
 *
 * 1. **MessageChannel**: A private communication channel created during discovery,
 *    not visible to other scripts on the page (unlike window.postMessage).
 *
 * 2. **ECDH Key Exchange**: The shared secret was derived during discovery using
 *    Elliptic Curve Diffie-Hellman key exchange.
 *
 * 3. **AES-GCM Encryption**: All messages are encrypted using AES-256-GCM,
 *    providing both confidentiality and authenticity.
 *
 * @example
 * ```typescript
 * // Discovery returns wallets with secure channel components
 * const wallets = await ExtensionProvider.discoverExtensions(chainInfo);
 * const { info, port, sharedKey } = wallets[0];
 *
 * // User can verify emoji if desired
 * console.log('Verify:', hashToEmoji(info.verificationHash!));
 *
 * // Create wallet using the discovered components
 * const wallet = await ExtensionWallet.create(info, chainInfo, port, sharedKey, 'my-dapp');
 *
 * // All subsequent calls are encrypted
 * const accounts = await wallet.getAccounts();
 * ```
 */
export class ExtensionWallet {
  /** Map of pending requests awaiting responses, keyed by message ID */
  private inFlight = new Map<string, PromiseWithResolvers<unknown>>();
  private disconnected = false;
  private disconnectCallbacks: DisconnectCallback[] = [];

  /**
   * Private constructor - use {@link ExtensionWallet.create} to instantiate.
   * @param chainInfo - The chain information (chainId and version)
   * @param appId - Application identifier for the requesting dApp
   * @param extensionId - The unique identifier of the target wallet extension
   * @param port - The MessagePort for private communication with the wallet
   * @param sharedKey - The derived AES-256-GCM shared key for encryption
   */
  private constructor(
    private chainInfo: ChainInfo,
    private appId: string,
    private extensionId: string,
    private port: MessagePort,
    private sharedKey: CryptoKey,
  ) {}

  /** Cached Wallet proxy instance */
  private walletProxy: Wallet | null = null;

  /**
   * Creates an ExtensionWallet instance that communicates with a browser extension
   * over a secure encrypted MessageChannel.
   *
   * @param walletInfo - The wallet info from ExtensionProvider.discoverExtensions()
   * @param chainInfo - The chain information (chainId and version) for request context
   * @param port - The MessagePort for private communication with the wallet
   * @param sharedKey - The derived AES-256-GCM shared key for encryption
   * @param appId - Application identifier used to identify the requesting dApp to the wallet
   * @returns The ExtensionWallet instance. Use {@link getWallet} to get the Wallet interface.
   *
   * @example
   * ```typescript
   * const wallets = await ExtensionProvider.discoverExtensions(chainInfo);
   * const { info, port, sharedKey } = wallets[0];
   * const extensionWallet = ExtensionWallet.create(
   *   info,
   *   { chainId: Fr(31337), version: Fr(0) },
   *   port,
   *   sharedKey,
   *   'my-defi-app'
   * );
   *
   * // Register disconnect handler
   * extensionWallet.onDisconnect(() => console.log('Disconnected!'));
   *
   * // Get the Wallet interface for dApp usage
   * const wallet = extensionWallet.getWallet();
   * const accounts = await wallet.getAccounts();
   * ```
   */
  static create(
    walletInfo: WalletInfo,
    chainInfo: ChainInfo,
    port: MessagePort,
    sharedKey: CryptoKey,
    appId: string,
  ): ExtensionWallet {
    const wallet = new ExtensionWallet(chainInfo, appId, walletInfo.id, port, sharedKey);

    // Set up message handler - all messages are now encrypted
    wallet.port.onmessage = (event: MessageEvent<EncryptedPayload>) => {
      void wallet.handleEncryptedResponse(event.data);
    };

    wallet.port.start();

    return wallet;
  }

  /**
   * Returns a Wallet interface that proxies all method calls through the secure channel.
   *
   * The returned Wallet can be used directly by dApps - all method calls are automatically
   * encrypted and sent to the wallet extension.
   *
   * @returns A Wallet implementation that encrypts all communication
   *
   * @example
   * ```typescript
   * const extensionWallet = ExtensionWallet.create(info, chainInfo, port, sharedKey, 'my-app');
   * const wallet = extensionWallet.getWallet();
   * const accounts = await wallet.getAccounts();
   * ```
   */
  getWallet(): Wallet {
    if (this.walletProxy) {
      return this.walletProxy;
    }

    // Create a Proxy that intercepts wallet method calls and forwards them to the extension
    this.walletProxy = new Proxy(this, {
      get: (target, prop) => {
        if (schemaHasMethod(WalletSchema, prop.toString())) {
          return async (...args: unknown[]) => {
            const result = await target.postMessage({
              type: prop.toString() as keyof FunctionsOf<Wallet>,
              args,
            });
            return WalletSchema[prop.toString() as keyof typeof WalletSchema].returnType().parseAsync(result);
          };
        } else {
          return target[prop as keyof ExtensionWallet];
        }
      },
    }) as unknown as Wallet;

    return this.walletProxy;
  }

  /**
   * Handles an encrypted response received from the wallet extension.
   *
   * Decrypts the response using the shared AES key and resolves or rejects
   * the corresponding pending promise based on the response content.
   *
   * @param encrypted - The encrypted response from the wallet
   */
  private async handleEncryptedResponse(encrypted: EncryptedPayload): Promise<void> {
    if (!this.sharedKey) {
      return;
    }

    try {
      const response = await decrypt<WalletResponse>(this.sharedKey, encrypted);

      const { messageId, result, error, walletId: responseWalletId } = response;

      // Check for disconnect notification from the wallet backend
      // This is sent as an encrypted error response with a special type
      if (
        error &&
        typeof error === 'object' &&
        'type' in error &&
        (error.type as WalletMessageType) === WalletMessageType.SESSION_DISCONNECTED
      ) {
        this.handleDisconnect();
        return;
      }

      if (!messageId || !responseWalletId) {
        return;
      }

      if (this.extensionId !== responseWalletId) {
        return;
      }

      if (!this.inFlight.has(messageId)) {
        return;
      }

      const { resolve, reject } = this.inFlight.get(messageId)!;

      if (error) {
        reject(new Error(jsonStringify(error)));
      } else {
        resolve(result);
      }
      this.inFlight.delete(messageId);
      // eslint-disable-next-line no-empty
    } catch {}
  }

  /**
   * Sends an encrypted wallet method call over the secure MessageChannel.
   *
   * The message is encrypted using AES-256-GCM with the shared key derived
   * during discovery. A unique message ID is generated to correlate
   * the response.
   *
   * @param call - The wallet method call containing method name and arguments
   * @returns A Promise that resolves with the decrypted result from the wallet
   *
   * @throws Error if the secure channel has not been established or wallet is disconnected
   */
  private async postMessage(call: WalletMethodCall): Promise<unknown> {
    if (this.disconnected) {
      throw new Error('Wallet has been disconnected');
    }
    if (!this.port || !this.sharedKey) {
      throw new Error('Secure channel not established');
    }

    const messageId = globalThis.crypto.randomUUID();
    const message: WalletMessage = {
      type: call.type,
      args: call.args,
      messageId,
      chainInfo: this.chainInfo,
      appId: this.appId,
      walletId: this.extensionId,
    };

    // Encrypt the message and send over the private MessageChannel
    const encrypted = await encrypt(this.sharedKey, message);
    this.port.postMessage(encrypted);

    const { promise, resolve, reject } = promiseWithResolvers<unknown>();
    this.inFlight.set(messageId, { promise, resolve, reject });
    return promise;
  }

  /**
   * Handles wallet disconnection.
   * Rejects all pending requests and notifies registered callbacks.
   * @internal
   */
  private handleDisconnect(): void {
    if (this.disconnected) {
      return;
    }
    this.disconnected = true;

    // Close the port to prevent any further messages
    if (this.port) {
      this.port.onmessage = null;
      this.port.close();
    }

    // Reject all pending requests
    // Note: These rejections should be caught by the callers, but we log them
    // here to help with debugging if they become unhandled
    const error = new Error('Wallet disconnected');
    for (const { reject } of this.inFlight.values()) {
      reject(error);
    }
    this.inFlight.clear();

    // Notify registered callbacks
    for (const callback of this.disconnectCallbacks) {
      try {
        callback();
      } catch {
        // Ignore errors in callbacks
      }
    }
  }

  /**
   * Registers a callback to be invoked when the wallet disconnects.
   *
   * @param callback - Function to call when wallet disconnects
   * @returns A function to unregister the callback
   *
   * @example
   * ```typescript
   * const wallet = await ExtensionWallet.create(...);
   * const unsubscribe = wallet.onDisconnect(() => {
   *   console.log('Wallet disconnected! Please reconnect.');
   *   // Clean up UI, prompt user to reconnect, etc.
   * });
   * // Later: unsubscribe(); to stop receiving notifications
   * ```
   */
  onDisconnect(callback: DisconnectCallback): () => void {
    this.disconnectCallbacks.push(callback);
    return () => {
      const index = this.disconnectCallbacks.indexOf(callback);
      if (index !== -1) {
        this.disconnectCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Returns whether the wallet has been disconnected.
   *
   * @returns true if the wallet is no longer connected
   */
  isDisconnected(): boolean {
    return this.disconnected;
  }

  /**
   * Disconnects from the wallet and cleans up resources.
   *
   * This method notifies the wallet extension that the session is ending,
   * allowing it to clean up its state. After calling this method, the wallet
   * instance can no longer be used and any pending requests will be rejected.
   *
   * @example
   * ```typescript
   * const wallet = await provider.connect('my-app');
   * // ... use wallet ...
   * await wallet.disconnect(); // Clean disconnect when done
   * ```
   */
  async disconnect(): Promise<void> {
    if (this.disconnected) {
      return;
    }

    // Send disconnect message to extension before closing
    if (this.port && this.sharedKey) {
      try {
        const message = {
          type: WalletMessageType.DISCONNECT,
          messageId: globalThis.crypto.randomUUID(),
          chainInfo: this.chainInfo,
          appId: this.appId,
          walletId: this.extensionId,
          args: [],
        };
        const encrypted = await encrypt(this.sharedKey, message);
        this.port.postMessage(encrypted);
      } catch {
        // Ignore errors sending disconnect message
      }
    }

    this.handleDisconnect();
    if (this.port) {
      this.port.close();
    }
  }
}
