// comlink:
//  Dev dependency just for the somewhat complex RemoteObject type
//  This takes a {foo(): T} and makes {foo(): Promise<T>}
//  while avoiding Promise of Promise.
import { type RemoteObject } from 'comlink';
import { format } from 'util';

import { createDebugLogger } from '../../log/logger.js';
import { toJSON } from '../convert.js';
import { defaultFetch } from './json_rpc_client.js';

export type ApiServerFor<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => Promise<infer _R> ? (...args: Args) => Promise<unknown> : never;
};

export { JsonStringify } from '../convert.js';

/**
 * Creates a Proxy object that delegates over RPC and satisfies RemoteObject<T>.
 * The server should have ran new JsonRpcServer().
 * @param host - The host URL.
 * @param stringClassMap - A map of class names to string representations.
 * @param objectClassMap - A map of class names to class constructors.
 * @param useApiEndpoints - Whether to use the API endpoints or the default RPC endpoint.
 * @param namespaceMethods - String value (or false/empty) to namespace all methods sent to the server. e.g. 'getInfo' -\> 'pxe_getInfo'
 * @param fetch - The fetch implementation to use.
 */
export function createSafeJsonRpcClient<T extends object, THandler extends { new (server: ApiServerFor<T>): T }>(
  host: string,
  handler: THandler,
  useApiEndpoints: boolean,
  namespaceMethods?: string | false,
  fetch = defaultFetch,
  log = createDebugLogger('json-rpc:client'),
) {
  let id = 0;
  const request = async (method: string, params: any[]): Promise<any> => {
    const body = {
      jsonrpc: '2.0',
      id: id++,
      method,
      params: toJSON(params ?? []),
    };
    log.debug(format(`JsonRpcClient.request`, method, '<-', params));
    const res = await fetch(host, method, body, useApiEndpoints);
    log.debug(format(`JsonRpcClient.result`, method, '->', res));
    if (res.error) {
      throw res.error;
    }
    // TODO(palla): Why check for string null and undefined?
    if ([null, undefined, 'null', 'undefined'].includes(res.result)) {
      return;
    }
    return res.result;
  };

  // Intercept any RPC methods with a proxy
  // This wraps 'request' with a method-call syntax wrapper
  const proxy = new Proxy(
    {},
    {
      get: (target, method: string) => {
        let rpcMethod = method;
        if (namespaceMethods) {
          rpcMethod = `${namespaceMethods}_${method}`;
        }
        if (['then', 'catch'].includes(method)) {
          return Reflect.get(target, method);
        }
        return (...params: any[]) => {
          log.debug(format(`JsonRpcClient.constructor`, 'proxy', rpcMethod, '<-', params));
          return request(rpcMethod, params);
        };
      },
    },
  ) as RemoteObject<T> as ApiServerFor<T>;
  // TODO(palla): Do we really need RemoteObject above? Should the return type of the overall fn be RemoteObject?

  return new handler(proxy);
}
