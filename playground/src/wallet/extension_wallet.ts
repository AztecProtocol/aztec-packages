import { WalletSchema, type Wallet } from '@aztec/aztec.js/wallet';
import { promiseWithResolvers, type PromiseWithResolvers } from '@aztec/foundation/promise';
import { schemaHasMethod } from '@aztec/foundation/schemas';
import { jsonStringify } from '@aztec/foundation/json-rpc';

type FunctionsOf<T> = { [K in keyof T as T[K] extends Function ? K : never]: T[K] };

export class ExtensionWallet {
  private inFlight = new Map<string, PromiseWithResolvers<any>>();

  private constructor() {}

  static create() {
    const wallet = new ExtensionWallet();
    window.addEventListener('message', async event => {
      if (event.source !== window) return;

      const { messageId, result, error } = event.data;
      if (!messageId) {
        return;
      }
      if (!wallet.inFlight.has(messageId)) {
        console.error('No in-flight message for id', messageId);
        return;
      }
      const { resolve, reject } = wallet.inFlight.get(messageId);

      if (error) {
        reject(new Error(error));
      } else {
        resolve(result);
      }
      wallet.inFlight.delete(messageId);
    });
    return new Proxy(wallet, {
      get: (target, prop) => {
        if (schemaHasMethod(WalletSchema, prop.toString())) {
          return async (...args: any[]) => {
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

  private async postMessage({ type, args }: { type: keyof FunctionsOf<Wallet>; args: any[] }) {
    const messageId = globalThis.crypto.randomUUID();
    window.postMessage(jsonStringify({ type, args, messageId }), '*');
    const { promise, resolve, reject } = promiseWithResolvers<any>();
    this.inFlight.set(messageId, { promise, resolve, reject });
    return promise;
  }
}
