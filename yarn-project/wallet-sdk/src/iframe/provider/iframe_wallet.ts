/**
 * IframeWallet — Wallet proxy that communicates with a web wallet loaded in an iframe.
 *
 * This mirrors {@link ExtensionWallet} from `@aztec/wallet-sdk/extension/provider` but uses
 * `window.postMessage` / `window.addEventListener('message')` instead of MessagePort.
 *
 * The wire protocol (encrypted {@link WalletMessage} / {@link WalletResponse}) is identical.
 */
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
  /** Wallet method name to invoke. */
  type: keyof FunctionsOf<Wallet>;
  /** Arguments to pass to the wallet method. */
  args: unknown[];
};

/**
 * A wallet implementation that communicates with a web wallet loaded in an iframe
 * using encrypted postMessage.
 *
 * Uses the same Proxy pattern as {@link ExtensionWallet}: intercepts property access,
 * checks if the property is a Wallet method via {@link WalletSchema}, and routes the
 * call through an encrypted postMessage channel.
 *
 * @example
 * ```typescript
 * const wallet = IframeWallet.create(walletId, sessionId, iframeWindow, walletOrigin, sharedKey, chainInfo, appId);
 * const accounts = await wallet.asWallet().getAccounts();
 * ```
 */
export class IframeWallet {
  private inFlight = new Map<string, PromiseWithResolvers<unknown>>();
  private disconnected = false;
  private disconnectCallbacks: DisconnectCallback[] = [];
  private messageListener: ((e: MessageEvent) => void) | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private lastInboundAt = 0;
  private log: WalletSdkLogger;
  private heartbeatIntervalMs: number;
  private heartbeatDeadAfterMs: number;

  private constructor(
    private chainInfo: ChainInfo,
    private appId: string,
    private walletId: string,
    private sessionId: string,
    private iframeWindow: Window,
    private walletOrigin: string,
    private sharedKey: CryptoKey,
    logger?: WalletSdkLogger,
    heartbeatOptions?: HeartbeatOptions,
  ) {
    this.log = logger ?? NOOP_LOGGER;
    this.heartbeatIntervalMs = heartbeatOptions?.intervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
    this.heartbeatDeadAfterMs = heartbeatOptions?.deadAfterMs ?? DEFAULT_HEARTBEAT_DEAD_AFTER_MS;
  }

  /**
   * Creates a proxied IframeWallet that implements the {@link Wallet} interface.
   *
   * All Wallet method calls are intercepted by a Proxy, encrypted with the shared
   * AES-256-GCM key, sent via postMessage, and the response is decrypted and
   * validated against {@link WalletSchema}.
   *
   * @param walletId - Unique identifier of the remote wallet
   * @param sessionId - Session identifier from the key exchange
   * @param iframeWindow - The iframe's contentWindow to post messages to
   * @param walletOrigin - Origin of the wallet iframe (for postMessage targeting)
   * @param sharedKey - AES-256-GCM key derived from ECDH key exchange
   * @param chainInfo - Network information (chainId and version)
   * @param appId - Application identifier for the requesting dApp
   * @param logger - Optional logger; defaults to a no-op logger to keep extension/page bundles small
   * @param heartbeatOptions - Optional override for heartbeat tuning (mostly useful for tests)
   * @returns A proxied IframeWallet — call `.asWallet()` to get the typed `Wallet`
   */
  static create(
    walletId: string,
    sessionId: string,
    iframeWindow: Window,
    walletOrigin: string,
    sharedKey: CryptoKey,
    chainInfo: ChainInfo,
    appId: string,
    logger?: WalletSdkLogger,
    heartbeatOptions?: HeartbeatOptions,
  ): IframeWallet {
    const wallet = new IframeWallet(
      chainInfo,
      appId,
      walletId,
      sessionId,
      iframeWindow,
      walletOrigin,
      sharedKey,
      logger,
      heartbeatOptions,
    );

    wallet.messageListener = (event: MessageEvent) => {
      if (event.origin !== walletOrigin) {
        return;
      }
      const msg = event.data;
      if (!msg || typeof msg !== 'object') {
        return;
      }

      if (msg.sessionId !== sessionId) {
        return;
      }

      // Any inbound traffic on our session counts as proof of liveness.
      wallet.lastInboundAt = Date.now();

      if (msg.type === WalletMessageType.SECURE_RESPONSE) {
        void wallet.handleEncryptedResponse(msg.encrypted as EncryptedPayload);
      } else if (msg.type === WalletMessageType.SESSION_DISCONNECTED) {
        wallet.handleDisconnect();
      }
    };
    window.addEventListener('message', wallet.messageListener);

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
          return target[prop as keyof IframeWallet];
        }
      },
    });
  }

  /**
   * Returns this wallet as a typed {@link Wallet} interface.
   * When accessed through the Proxy (via `create()`), returns the proxy itself.
   */
  asWallet(): Wallet {
    return this as unknown as Wallet;
  }

  private async handleEncryptedResponse(encrypted: EncryptedPayload): Promise<void> {
    try {
      const response = await decrypt<WalletResponse>(this.sharedKey, encrypted);
      const { messageId, result, error, walletId: responseWalletId } = response;

      if (!messageId || responseWalletId !== this.walletId) {
        return;
      }

      const pending = this.inFlight.get(messageId);
      if (!pending) {
        return;
      }

      if (error) {
        pending.reject(new Error(jsonStringify(error)));
      } else {
        pending.resolve(result);
      }
      this.inFlight.delete(messageId);
      this.maybeStopHeartbeat();
    } catch (err) {
      this.log.warn('Failed to decrypt wallet response', { err });
    }
  }

  private async postMessage(call: WalletMethodCall): Promise<unknown> {
    if (this.disconnected) {
      throw new Error('Wallet has been disconnected');
    }

    const messageId = globalThis.crypto.randomUUID();
    const message: WalletMessage = {
      type: call.type,
      args: call.args,
      messageId,
      chainInfo: this.chainInfo,
      appId: this.appId,
      walletId: this.walletId,
    };

    const encrypted = await encrypt(this.sharedKey, jsonStringify(message));
    this.iframeWindow.postMessage(
      { type: WalletMessageType.SECURE_MESSAGE, sessionId: this.sessionId, encrypted },
      this.walletOrigin,
    );

    const { promise, resolve, reject } = promiseWithResolvers<unknown>();
    this.inFlight.set(messageId, { promise, resolve, reject });
    this.startHeartbeat();
    return promise;
  }

  /**
   * Start liveness probing while at least one request is in flight. PINGs are
   * unencrypted control messages — older wallet handlers that don't understand
   * them simply drop them, but any inbound traffic (PONG, encrypted response,
   * disconnect notice) resets the idle timer, so a slow-but-alive legacy wallet
   * never trips a false disconnect.
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
      this.log.warn('Iframe wallet channel unresponsive — declaring disconnect', {
        idleMs,
        inFlight: this.inFlight.size,
      });
      this.handleDisconnect();
      return;
    }

    try {
      this.iframeWindow.postMessage({ type: WalletMessageType.PING, sessionId: this.sessionId }, this.walletOrigin);
    } catch (err) {
      this.log.warn('Failed to send heartbeat PING', { err });
    }
  }

  private handleDisconnect(): void {
    if (this.disconnected) {
      return;
    }
    this.disconnected = true;

    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }

    const error = new Error('Wallet disconnected');
    for (const { reject } of this.inFlight.values()) {
      reject(error);
    }
    this.inFlight.clear();

    for (const cb of this.disconnectCallbacks) {
      try {
        cb();
      } catch {
        // Ignore errors in disconnect callbacks
      }
    }
  }

  onDisconnect(callback: DisconnectCallback): () => void {
    this.disconnectCallbacks.push(callback);
    return () => {
      const i = this.disconnectCallbacks.indexOf(callback);
      if (i !== -1) {
        this.disconnectCallbacks.splice(i, 1);
      }
    };
  }

  isDisconnected(): boolean {
    return this.disconnected;
  }

  disconnect(): void {
    if (this.disconnected) {
      return;
    }
    this.iframeWindow.postMessage({ type: WalletMessageType.DISCONNECT, sessionId: this.sessionId }, this.walletOrigin);
    this.handleDisconnect();
  }
}
