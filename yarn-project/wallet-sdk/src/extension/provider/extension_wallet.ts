import type { ChainInfo } from '@aztec/aztec.js/account';
import { type Wallet, WalletSchema } from '@aztec/aztec.js/wallet';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { getSchemaReturnType, schemaHasMethod } from '@aztec/foundation/schemas';
import type { FunctionsOf } from '@aztec/foundation/types';

import { type EncryptedPayload, decrypt, encrypt } from '../../crypto.js';
import {
  DEFAULT_HEARTBEAT_DEAD_AFTER_MS,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  type DisconnectCallback,
  type HeartbeatOptions,
  NOOP_LOGGER,
  type WalletMessage,
  WalletMessageType,
  type WalletResponse,
  type WalletSdkLogger,
} from '../../types.js';

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
 * A wallet implementation that communicates with browser extension wallets
 * using an encrypted MessageChannel.
 *
 * This class uses a secure channel established after discovery:
 *
 * 1. **MessageChannel**: Created during discovery and transferred via window.postMessage.
 *    Note: The port transfer is visible to page scripts, but security comes from encryption.
 *
 * 2. **ECDH Key Exchange**: The shared secret was derived after discovery using
 *    Elliptic Curve Diffie-Hellman key exchange over the MessagePort.
 *
 * 3. **AES-GCM Encryption**: All messages are encrypted using AES-256-GCM,
 *    providing both confidentiality and authenticity. This is what secures the channel.
 *
 * @example
 * ```typescript
 * // Discover and establish secure channel to a wallet
 * const discoveredWallets = await ExtensionProvider.discoverWallets(chainInfo, { appId: 'my-dapp' });
 * const connection = await discoveredWallets[0].establishSecureChannel();
 *
 * // User can verify emoji if desired
 * console.log('Verify:', hashToEmoji(connection.info.verificationHash!));
 *
 * // Create wallet using the connection
 * const wallet = ExtensionWallet.create(connection.info.id, connection.port, connection.sharedKey, chainInfo, 'my-dapp');
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
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastInboundAt = 0;
  private log: WalletSdkLogger;
  private heartbeatIntervalMs: number;
  private heartbeatDeadAfterMs: number;

  /**
   * Private constructor - use {@link ExtensionWallet.create} to instantiate.
   * @param chainInfo - The chain information (chainId and version)
   * @param appId - Application identifier for the requesting dApp
   * @param extensionId - The unique identifier of the target wallet extension
   * @param port - The MessagePort for private communication with the wallet
   * @param sharedKey - The derived AES-256-GCM shared key for encryption
   * @param logger - Optional logger; defaults to a no-op logger
   * @param heartbeatOptions - Optional heartbeat tuning (mostly useful for tests)
   */
  private constructor(
    private chainInfo: ChainInfo,
    private appId: string,
    private extensionId: string,
    private port: MessagePort,
    private sharedKey: CryptoKey,
    logger?: WalletSdkLogger,
    heartbeatOptions?: HeartbeatOptions,
  ) {
    this.log = logger ?? NOOP_LOGGER;
    this.heartbeatIntervalMs = heartbeatOptions?.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.heartbeatDeadAfterMs = heartbeatOptions?.deadAfterMs ?? DEFAULT_HEARTBEAT_DEAD_AFTER_MS;
  }

  /**
   * Creates a Wallet that communicates with a browser extension
   * over a secure encrypted MessageChannel.
   *
   * @param extensionId - The unique identifier of the wallet extension
   * @param port - The MessagePort for encrypted communication with the wallet
   * @param sharedKey - The derived AES-256-GCM shared key for encryption
   * @param chainInfo - The chain information (chainId and version) for request context
   * @param appId - Application identifier used to identify the requesting dApp to the wallet
   * @param logger - Optional logger; defaults to a no-op logger to keep extension/page bundles small
   * @param heartbeatOptions - Optional override for heartbeat tuning (mostly useful for tests)
   * @returns A Wallet interface where all method calls are encrypted
   *
   * @example
   * ```typescript
   * const discoveredWallets = await ExtensionProvider.discoverWallets(chainInfo, { appId: 'my-defi-app' });
   * const connection = await discoveredWallets[0].establishSecureChannel();
   * const wallet = ExtensionWallet.create(
   *   connection.info.id,
   *   connection.port,
   *   connection.sharedKey,
   *   chainInfo,
   *   'my-defi-app'
   * );
   *
   * const accounts = await wallet.getAccounts();
   * ```
   */
  static create(
    extensionId: string,
    port: MessagePort,
    sharedKey: CryptoKey,
    chainInfo: ChainInfo,
    appId: string,
    logger?: WalletSdkLogger,
    heartbeatOptions?: HeartbeatOptions,
  ): ExtensionWallet {
    const wallet = new ExtensionWallet(chainInfo, appId, extensionId, port, sharedKey, logger, heartbeatOptions);

    // Set up message handler for encrypted responses and unencrypted control messages
    wallet.port.onmessage = (event: MessageEvent) => {
      const data = event.data;
      // Any inbound traffic counts as proof of liveness.
      wallet.lastInboundAt = Date.now();

      if (data && typeof data === 'object' && 'type' in data && data.type === WalletMessageType.DISCONNECT) {
        wallet.handleDisconnect();
        return;
      }
      // Otherwise treat as encrypted payload
      void wallet.handleEncryptedResponse(data as EncryptedPayload);
    };

    wallet.port.start();

    return new Proxy(wallet, {
      get: (target, prop, receiver) => {
        if (prop === 'asWallet') {
          return () => receiver as unknown as Wallet;
        } else if (schemaHasMethod(WalletSchema, prop.toString())) {
          return async (...args: unknown[]) => {
            const result = await target.postMessage({
              type: prop.toString() as keyof FunctionsOf<Wallet>,
              args,
            });
            return getSchemaReturnType(WalletSchema[prop.toString() as keyof typeof WalletSchema]).parseAsync(result);
          };
        } else {
          return target[prop as keyof ExtensionWallet];
        }
      },
    });
  }

  asWallet(): Wallet {
    // Overridden by the proxy in create() to return the proxy itself.
    // This body is never reached when accessed through create().
    return this as unknown as Wallet;
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
      this.maybeStopHeartbeat();
    } catch (err) {
      this.log.warn('Failed to decrypt wallet response', { err });
    }
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

    const encrypted = await encrypt(this.sharedKey, jsonStringify(message));
    this.port.postMessage(encrypted);

    const { promise, resolve, reject } = promiseWithResolvers<unknown>();
    this.inFlight.set(messageId, { promise, resolve, reject });
    this.startHeartbeat();
    return promise;
  }

  /**
   * Start the heartbeat probe loop while at least one request is in flight.
   * Idempotent — calling while already running is a no-op.
   *
   * Heartbeat is opt-in via wire protocol: PINGs are unencrypted control messages
   * (like DISCONNECT). Older wallets that do not understand PING simply drop it,
   * which is safe — we only declare disconnect when **no** inbound traffic of any
   * kind (PONG, encrypted response, DISCONNECT) arrives within the dead window.
   * A wallet that is processing a slow request will reset the timer when it
   * eventually responds, so this never causes false disconnects on legacy peers.
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer !== null || this.disconnected) {
      return;
    }
    this.lastInboundAt = Date.now();
    this.heartbeatTimer = setInterval(() => this.heartbeatTick(), this.heartbeatIntervalMs);
  }

  private maybeStopHeartbeat(): void {
    if (this.inFlight.size === 0 && this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private heartbeatTick(): void {
    if (this.disconnected || this.inFlight.size === 0) {
      this.maybeStopHeartbeat();
      return;
    }

    const idleMs = Date.now() - this.lastInboundAt;
    if (idleMs >= this.heartbeatDeadAfterMs) {
      this.log.warn('Wallet channel unresponsive — declaring disconnect', {
        idleMs,
        inFlight: this.inFlight.size,
      });
      this.handleDisconnect();
      return;
    }

    try {
      this.port.postMessage({ type: WalletMessageType.PING });
    } catch (err) {
      this.log.warn('Failed to send heartbeat PING', { err });
    }
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

    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.port) {
      this.port.onmessage = null;
      this.port.close();
    }

    const error = new Error('Wallet disconnected');
    for (const { reject } of this.inFlight.values()) {
      reject(error);
    }
    this.inFlight.clear();

    for (const callback of this.disconnectCallbacks) {
      try {
        callback();
      } catch {
        // Ignore errors on disconnect callbacks
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
   * const extensionWallet = ExtensionWallet.create(extensionId, port, sharedKey, chainInfo, 'my-app');
   * // ... use wallet ...
   * await extensionWallet.disconnect(); // Clean disconnect when done
   * ```
   */
  // eslint-disable-next-line require-await -- async for interface compatibility
  async disconnect(): Promise<void> {
    if (this.disconnected) {
      return;
    }

    if (this.port) {
      // Send unencrypted disconnect - control messages don't need encryption
      this.port.postMessage({
        type: WalletMessageType.DISCONNECT,
      });
    }

    this.handleDisconnect();
  }
}
