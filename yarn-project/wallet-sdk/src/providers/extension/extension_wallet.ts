import type { ChainInfo } from '@aztec/aztec.js/account';
import { type Wallet, WalletSchema } from '@aztec/aztec.js/wallet';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { schemaHasMethod } from '@aztec/foundation/schemas';
import type { FunctionsOf } from '@aztec/foundation/types';

import { type EncryptedPayload, decrypt, encrypt } from '../../crypto.js';
import type { WalletInfo, WalletMessage, WalletResponse } from '../../types.js';

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

  /**
   * Creates an ExtensionWallet instance that proxies wallet calls to a browser extension
   * over a secure encrypted MessageChannel.
   *
   * @param walletInfo - The wallet info from ExtensionProvider.discoverExtensions()
   * @param chainInfo - The chain information (chainId and version) for request context
   * @param port - The MessagePort for private communication with the wallet
   * @param sharedKey - The derived AES-256-GCM shared key for encryption
   * @param appId - Application identifier used to identify the requesting dApp to the wallet
   * @returns A Promise resolving to a Wallet implementation that encrypts all communication
   *
   * @example
   * ```typescript
   * const wallets = await ExtensionProvider.discoverExtensions(chainInfo);
   * const { info, port, sharedKey } = wallets[0];
   * const wallet = await ExtensionWallet.create(
   *   info,
   *   { chainId: Fr(31337), version: Fr(0) },
   *   port,
   *   sharedKey,
   *   'my-defi-app'
   * );
   * ```
   */
  static create(
    walletInfo: WalletInfo,
    chainInfo: ChainInfo,
    port: MessagePort,
    sharedKey: CryptoKey,
    appId: string,
  ): Wallet {
    const wallet = new ExtensionWallet(chainInfo, appId, walletInfo.id, port, sharedKey);

    // Set up message handler
    wallet.port.onmessage = (event: MessageEvent<EncryptedPayload>) => {
      void wallet.handleEncryptedResponse(event.data);
    };

    wallet.port.start();

    // Create a Proxy that intercepts wallet method calls and forwards them to the extension
    return new Proxy(wallet, {
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
   * @throws Error if the secure channel has not been established
   */
  private async postMessage(call: WalletMethodCall): Promise<unknown> {
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
   * Closes the secure channel and cleans up resources.
   *
   * After calling this method, the wallet instance can no longer be used.
   * Any pending requests will not receive responses.
   *
   * @example
   * ```typescript
   * const { info, port, sharedKey } = wallets[0];
   * const wallet = await ExtensionWallet.create(info, chainInfo, port, sharedKey, 'my-app');
   * // ... use wallet ...
   * wallet.close(); // Clean up when done
   * ```
   */
  close(): void {
    if (this.port) {
      this.port.close();
    }
    this.inFlight.clear();
  }
}
