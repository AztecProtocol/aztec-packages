import { format } from 'util';

import { type Logger, createLogger } from '../../log/pino-logger.js';
import {
  type ApiSchema,
  type ApiSchemaFor,
  type ZodFunctionFor,
  schemaHasKey,
  schemaKeyIsFunction,
} from '../../schemas/api.js';
import { type JsonRpcFetch, defaultFetch } from './fetch.js';

export type SafeJsonRpcClientOptions = {
  useApiEndpoints?: boolean;
  namespaceMethods?: string | false;
  fetch?: JsonRpcFetch;
  log?: Logger;
  proxy?: {
    [key: string]: any;
  };
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
  const request = async (key: string, params: any[]): Promise<any> => {
    if (!schemaHasKey(schema, key)) {
      throw new Error(`Unspecified key ${key} in client schema`);
    }

    const method = namespaceMethods ? `${namespaceMethods}_${key}` : key;
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
    return ((schema as ApiSchema)[key] as ZodFunctionFor<any, any>).returnType().parseAsync(response.result);
  };

  const proxy: any = {};
  for (const key of Object.keys(schema)) {
    if (schemaKeyIsFunction(schema, key)) {
      proxy[key] = (...params: any[]) => request(key, params);
    } else {
      const subSchema = schema[key as keyof T];
      proxy[key] = createSafeJsonRpcClient(host, subSchema as ApiSchemaFor<typeof subSchema>, {
        ...config,
        namespaceMethods: `${namespaceMethods ? `${namespaceMethods}_` : ''}${key}`,
      });
    }
  }

  return proxy as T;
}
