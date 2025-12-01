import type { ChainInfo } from '@aztec/aztec.js/account';
import { type Wallet, WalletSchema } from '@aztec/aztec.js/wallet';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type PromiseWithResolvers, promiseWithResolvers } from '@aztec/foundation/promise';
import { schemaHasMethod } from '@aztec/foundation/schemas';
import type { FunctionsOf } from '@aztec/foundation/types';

import type { WalletMessage, WalletResponse } from '../types.js';

/**
 * Message payload for posting to extension
 */
type WalletMethodCall = {
  /**
   * The wallet method name to invoke
   */
  type: keyof FunctionsOf<Wallet>;
  /**
   * Arguments to pass to the wallet method
   */
  args: unknown[];
};

/**
 * A wallet implementation that communicates with browser extension wallets
 * Supports multiple extensions by targeting specific extension IDs
 */
export class ExtensionWallet {
  private inFlight = new Map<string, PromiseWithResolvers<unknown>>();

  private constructor(
    private chainInfo: ChainInfo,
    private appId: string,
    private extensionId: string,
  ) {}

  /**
   * Creates an ExtensionWallet instance that proxies wallet calls to a browser extension
   * @param chainInfo - The chain information (chainId and version)
   * @param appId - Application identifier for the requesting dapp
   * @param extensionId - Specific extension ID to communicate with
   * @returns A Proxy object that implements the Wallet interface
   */
  static create(chainInfo: ChainInfo, appId: string, extensionId: string): Wallet {
    const wallet = new ExtensionWallet(chainInfo, appId, extensionId);

    // Set up message listener for responses from extensions
    window.addEventListener('message', event => {
      if (event.source !== window) {
        return;
      }

      let data: WalletResponse;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      // Ignore request messages (only process responses)
      if ('type' in data) {
        return;
      }

      const { messageId, result, error, walletId: responseWalletId } = data;

      if (!messageId || !responseWalletId) {
        return;
      }

      if (wallet.extensionId !== responseWalletId) {
        return;
      }

      if (!wallet.inFlight.has(messageId)) {
        return;
      }

      const { resolve, reject } = wallet.inFlight.get(messageId)!;

      if (error) {
        reject(new Error(jsonStringify(error)));
      } else {
        resolve(result);
      }
      wallet.inFlight.delete(messageId);
    });

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

  private postMessage(call: WalletMethodCall): Promise<unknown> {
    const messageId = globalThis.crypto.randomUUID();
    const message: WalletMessage = {
      type: call.type,
      args: call.args,
      messageId,
      chainInfo: this.chainInfo,
      appId: this.appId,
      walletId: this.extensionId,
    };

    window.postMessage(jsonStringify(message), '*');

    const { promise, resolve, reject } = promiseWithResolvers<unknown>();
    this.inFlight.set(messageId, { promise, resolve, reject });
    return promise;
  }
}
