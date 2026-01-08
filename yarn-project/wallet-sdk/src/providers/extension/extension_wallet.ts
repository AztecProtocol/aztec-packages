import type { ChainInfo } from '@aztec/aztec.js/account';
import { type Wallet, WalletSchema } from '@aztec/aztec.js/wallet';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { schemaHasMethod } from '@aztec/foundation/schemas';
import type { FunctionsOf } from '@aztec/foundation/types';

import {
  type EncryptedPayload,
  type ExportedPublicKey,
  decrypt,
  deriveSharedKey,
  encrypt,
  exportPublicKey,
  generateKeyPair,
  importPublicKey,
} from '../../crypto.js';
import type { ConnectRequest, WalletInfo, WalletMessage, WalletResponse } from '../../types.js';

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
 * This class establishes a private communication channel with a wallet extension
 * using the following security mechanisms:
 *
 * 1. **MessageChannel**: Creates a private communication channel that is not
 *    visible to other scripts on the page (unlike window.postMessage).
 *
 * 2. **ECDH Key Exchange**: Uses Elliptic Curve Diffie-Hellman to derive a
 *    shared secret between the dApp and wallet without transmitting private keys.
 *
 * 3. **AES-GCM Encryption**: All messages after channel establishment are
 *    encrypted using AES-256-GCM, providing both confidentiality and authenticity.
 *
 * @example
 * ```typescript
 * // Discovery returns wallet info including the wallet's public key
 * const wallets = await ExtensionProvider.discoverExtensions(chainInfo);
 * const walletInfo = wallets[0];
 *
 * // Create a secure connection to the wallet
 * const wallet = await ExtensionWallet.create(walletInfo, chainInfo, 'my-dapp');
 *
 * // All subsequent calls are encrypted
 * const accounts = await wallet.getAccounts();
 * ```
 */
export class ExtensionWallet {
  /** Map of pending requests awaiting responses, keyed by message ID */
  private inFlight = new Map<string, PromiseWithResolvers<unknown>>();

  /** The MessagePort for private communication with the extension */
  private port: MessagePort | null = null;

  /** The derived AES-GCM key for encrypting/decrypting messages */
  private sharedKey: CryptoKey | null = null;

  /**
   * Private constructor - use {@link ExtensionWallet.create} to instantiate.
   * @param chainInfo - The chain information (chainId and version)
   * @param appId - Application identifier for the requesting dApp
   * @param extensionId - The unique identifier of the target wallet extension
   */
  private constructor(
    private chainInfo: ChainInfo,
    private appId: string,
    private extensionId: string,
  ) {}

  /**
   * Creates an ExtensionWallet instance that proxies wallet calls to a browser extension
   * over a secure encrypted MessageChannel.
   *
   * The connection process:
   * 1. Generates an ECDH key pair for this session
   * 2. Derives a shared AES-256 key using the wallet's public key
   * 3. Creates a MessageChannel and transfers one port to the extension
   * 4. Returns a Proxy that encrypts all wallet method calls
   *
   * @param walletInfo - The discovered wallet information, including the wallet's ECDH public key
   * @param chainInfo - The chain information (chainId and version) for request context
   * @param appId - Application identifier used to identify the requesting dApp to the wallet
   * @returns A Promise resolving to a Wallet implementation that encrypts all communication
   *
   * @throws Error if the secure channel cannot be established
   *
   * @example
   * ```typescript
   * const wallet = await ExtensionWallet.create(
   *   walletInfo,
   *   { chainId: Fr(31337), version: Fr(0) },
   *   'my-defi-app'
   * );
   * ```
   */
  static async create(walletInfo: WalletInfo, chainInfo: ChainInfo, appId: string): Promise<Wallet> {
    const wallet = new ExtensionWallet(chainInfo, appId, walletInfo.id);

    if (!walletInfo.publicKey) {
      throw new Error('Wallet does not support secure channel establishment (missing public key)');
    }

    await wallet.establishSecureChannel(walletInfo.publicKey);

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
   * Establishes a secure MessageChannel with ECDH key exchange.
   *
   * This method performs the cryptographic handshake:
   * 1. Generates a new ECDH P-256 key pair for this session
   * 2. Imports the wallet's public key and derives a shared secret
   * 3. Creates a MessageChannel for private communication
   * 4. Sends a connection request with our public key via window.postMessage
   *    (this is the only public message - subsequent communication uses the private channel)
   *
   * @param walletExportedPublicKey - The wallet's ECDH public key in JWK format
   */
  private async establishSecureChannel(walletExportedPublicKey: ExportedPublicKey): Promise<void> {
    const keyPair = await generateKeyPair();
    const exportedPublicKey = await exportPublicKey(keyPair.publicKey);

    const walletPublicKey = await importPublicKey(walletExportedPublicKey);
    this.sharedKey = await deriveSharedKey(keyPair.privateKey, walletPublicKey);

    const channel = new MessageChannel();
    this.port = channel.port1;

    this.port.onmessage = async (event: MessageEvent<EncryptedPayload>) => {
      await this.handleEncryptedResponse(event.data);
    };

    this.port.start();

    // Send connection request with our public key and transfer port2 to content script
    // This is the only public postMessage - it contains our public key (safe to expose)
    // and transfers the MessagePort for subsequent private communication
    const connectRequest: ConnectRequest = {
      type: 'aztec-wallet-connect',
      walletId: this.extensionId,
      appId: this.appId,
      publicKey: exportedPublicKey,
    };

    window.postMessage(jsonStringify(connectRequest), '*', [channel.port2]);
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
   * during channel establishment. A unique message ID is generated to correlate
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
   * const wallet = await ExtensionWallet.create(walletInfo, chainInfo, 'my-app');
   * // ... use wallet ...
   * wallet.close(); // Clean up when done
   * ```
   */
  close(): void {
    if (this.port) {
      this.port.close();
      this.port = null;
    }
    this.sharedKey = null;
    this.inFlight.clear();
  }
}
