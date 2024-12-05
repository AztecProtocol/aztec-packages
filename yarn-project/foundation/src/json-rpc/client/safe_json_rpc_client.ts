import { format } from 'util';

import { createDebugLogger } from '../../log/pino-logger.js';
import { type ApiSchema, type ApiSchemaFor, schemaHasMethod } from '../../schemas/api.js';
import { defaultFetch } from './fetch.js';

/**
 * Creates a Proxy object that delegates over RPC and validates outputs against a given schema.
 * The server is expected to be a JsonRpcServer.
 * @param host - The host URL.
 * @param schema - The api schema to validate returned data against.
 * @param useApiEndpoints - Whether to use the API endpoints or the default RPC endpoint.
 * @param namespaceMethods - String value (or false/empty) to namespace all methods sent to the server. e.g. 'getInfo' -\> 'pxe_getInfo'
 * @param fetch - The fetch implementation to use.
 */
export function createSafeJsonRpcClient<T extends object>(
  host: string,
  schema: ApiSchemaFor<T>,
  useApiEndpoints: boolean = false,
  namespaceMethods?: string | false,
  fetch = defaultFetch,
  log = createDebugLogger('json-rpc:client'),
): T {
  let id = 0;
  const request = async (methodName: string, params: any[]): Promise<any> => {
    if (!schemaHasMethod(schema, methodName)) {
      throw new Error(`Unspecified method ${methodName} in client schema`);
    }
    const method = namespaceMethods ? `${namespaceMethods}_${methodName}` : methodName;
    const body = { jsonrpc: '2.0', id: id++, method, params };

    log.debug(format(`request`, method, params));
    const res = await fetch(host, method, body, useApiEndpoints);
    log.debug(format(`result`, method, res));

    if (res.error) {
      throw res.error;
    }
    // TODO(palla/schemas): Find a better way to handle null responses (JSON.stringify(null) is string "null").
    if ([null, undefined, 'null', 'undefined'].includes(res.result)) {
      return;
    }

    return (schema as ApiSchema)[methodName].returnType().parse(res.result);
  };

  // Intercept any RPC methods with a proxy
  const proxy = new Proxy(
    {},
    {
      get: (target, method: string) => {
        if (['then', 'catch'].includes(method)) {
          return Reflect.get(target, method);
        }
        return (...params: any[]) => request(method, params);
      },
    },
  ) as T;

  return proxy;
}
