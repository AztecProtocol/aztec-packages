import { WalletSchema, type Wallet } from '@aztec/aztec.js/wallet';
import { promiseWithResolvers, type PromiseWithResolvers } from '@aztec/foundation/promise';
import { schemaHasMethod } from '@aztec/foundation/schemas';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import type { ChainInfo } from '@aztec/aztec.js/account';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type FunctionsOf<T> = { [K in keyof T as T[K] extends Function ? K : never]: T[K] };

export class ExtensionWallet {
  private inFlight = new Map<string, PromiseWithResolvers<unknown>>();

  private constructor(
    private chainInfo: ChainInfo,
    private appId: string,
  ) {}

  static create(chainInfo: ChainInfo, appId: string) {
    const wallet = new ExtensionWallet(chainInfo, appId);
    window.addEventListener('message', async event => {
      if (event.source !== window) return;

      const { messageId, result, error } = event.data;
      if (!messageId) {
        return;
      }
      if (!wallet.inFlight.has(messageId)) {
        return;
      }
      const { resolve, reject } = wallet.inFlight.get(messageId);

      if (error) {
        reject(new Error(jsonStringify(error)));
      } else {
        resolve(result);
      }
      wallet.inFlight.delete(messageId);
    });
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
          return target[prop];
        }
      },
    }) as unknown as Wallet;
  }

  private async postMessage({ type, args }: { type: keyof FunctionsOf<Wallet>; args: unknown[] }) {
    const messageId = globalThis.crypto.randomUUID();
    window.postMessage(jsonStringify({ type, args, messageId, chainInfo: this.chainInfo, appId: this.appId }), '*');
    const { promise, resolve, reject } = promiseWithResolvers<unknown>();
    this.inFlight.set(messageId, { promise, resolve, reject });
    return promise;
  }
}
