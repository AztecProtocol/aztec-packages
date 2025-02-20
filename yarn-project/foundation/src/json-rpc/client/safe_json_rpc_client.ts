import { format } from 'util';

import { createLogger } from '../../log/pino-logger.js';
import type { Logger } from '../../log/pino-logger.js';
import { schemaHasMethod } from '../../schemas/api.js';
import type { ApiSchema, ApiSchemaFor } from '../../schemas/api.js';
import { defaultFetch } from './fetch.js';
import type { JsonRpcFetch } from './fetch.js';

export type SafeJsonRpcClientOptions = {
  useApiEndpoints?: boolean;
  namespaceMethods?: string | false;
  fetch?: JsonRpcFetch;
  log?: Logger;
  onResponse?: (res: {
    response: any;
    headers: { get: (header: string) => string | null | undefined };
  }) => Promise<void>;
};

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
  config: SafeJsonRpcClientOptions = {},
): T {
  const fetch = config.fetch ?? defaultFetch;
  const log = config.log ?? createLogger('json-rpc:client');
  const { useApiEndpoints = false, namespaceMethods = false } = config;

  let id = 0;
  const request = async (methodName: string, params: any[]): Promise<any> => {
    if (!schemaHasMethod(schema, methodName)) {
      throw new Error(`Unspecified method ${methodName} in client schema`);
    }
    const method = namespaceMethods ? `${namespaceMethods}_${methodName}` : methodName;
    const body = { jsonrpc: '2.0', id: id++, method, params };

    log.debug(format(`request`, method, params));
    const { response, headers } = await fetch(host, method, body, useApiEndpoints);
    log.debug(format(`result`, method, response));

    if (config.onResponse) {
      await config.onResponse({ response, headers });
    }
    if (response.error) {
      throw response.error;
    }
    // TODO(palla/schemas): Find a better way to handle null responses (JSON.stringify(null) is string "null").
    if ([null, undefined, 'null', 'undefined'].includes(response.result)) {
      return;
    }
    return (schema as ApiSchema)[methodName].returnType().parseAsync(response.result);
  };

  const proxy: any = {};
  for (const method of Object.keys(schema)) {
    proxy[method] = (...params: any[]) => request(method, params);
  }

  return proxy as T;
}
