import { format } from 'util';

import { type Logger, createLogger } from '../../log/pino-logger.js';
import { type PromiseWithResolvers, promiseWithResolvers } from '../../promise/utils.js';
import { type ApiSchema, type ApiSchemaFor, schemaHasMethod } from '../../schemas/api.js';
import { type JsonRpcFetch, defaultFetch } from './fetch.js';

const DEFAULT_BATCH_WINDOW_MS = 10;

export type SafeJsonRpcClientOptions = {
  namespaceMethods?: string | false;
  fetch?: JsonRpcFetch;
  log?: Logger;
  batchWindowMS?: number;
  onResponse?: (res: {
    response: any;
    headers: { get: (header: string) => string | null | undefined };
  }) => Promise<void>;
};

type JsonRpcRequest = {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: Array<any>;
};

type JsonRpcResponse =
  | {
      jsonrpc: '2.0';
      id?: number;
      result: any;
    }
  | {
      jsonrpc: '2.0';
      id?: number;
      error: { code: number; data?: any; message: string };
    };

/**
 * Creates a Proxy object that delegates over RPC and validates outputs against a given schema.
 * The server is expected to be a JsonRpcServer.
 * @param host - The host URL.
 * @param schema - The api schema to validate returned data against.
 * @param fetch - The fetch implementation to use.
 */
export function createSafeJsonRpcClient<T extends object>(
  host: string,
  schema: ApiSchemaFor<T>,
  config: SafeJsonRpcClientOptions = {},
): T {
  const fetch = config.fetch ?? defaultFetch;
  const log = config.log ?? createLogger('json-rpc:client');
  const { namespaceMethods = false, batchWindowMS = DEFAULT_BATCH_WINDOW_MS } = config;

  let id = 0;
  let sendBatchTimeoutHandle: NodeJS.Timeout | undefined;
  let queue: Array<{ request: JsonRpcRequest; deferred: PromiseWithResolvers<JsonRpcResponse> }> = [];

  const sendBatch = async () => {
    if (typeof sendBatchTimeoutHandle !== 'undefined') {
      clearTimeout(sendBatchTimeoutHandle);
      sendBatchTimeoutHandle = undefined;
    }

    const rpcCalls = queue;
    queue = [];

    const { response, headers } = await fetch(
      host,
      rpcCalls.map(({ request }) => request),
    );

    if (config.onResponse) {
      await config.onResponse({ response, headers });
    }

    if (!Array.isArray(response) || response.length !== rpcCalls.length) {
      log.warn(
        `Invalid response received from JSON-RPC server. Expected array of responses of length ${rpcCalls.length}`,
        { response },
      );
      for (let i = 0; i < rpcCalls.length; i++) {
        const { request, deferred } = rpcCalls[i];
        deferred.resolve({
          id: request.id,
          jsonrpc: '2.0',
          error: {
            code: -32000,
            data: response,
            message: 'Failed request',
          },
        });
      }
    } else {
      for (let i = 0; i < response.length; i++) {
        const resp: JsonRpcResponse = response[i];
        const { request, deferred } = rpcCalls[i];

        if (resp.id !== request.id) {
          log.warn(`Invalid response received at index ${i} from JSON-RPC server: id mismatch`, {
            requestMethod: request.method,
            requestId: request.id,
            responseId: resp.id,
          });
          deferred.resolve({
            id: request.id,
            jsonrpc: '2.0',
            error: {
              code: -32001,
              data: resp,
              message: 'RPC id mismatch',
            },
          });
        } else {
          deferred.resolve(resp);
        }
      }
    }
  };

  const request = async (methodName: string, params: any[]): Promise<any> => {
    if (!schemaHasMethod(schema, methodName)) {
      throw new Error(`Unspecified method ${methodName} in client schema`);
    }
    const method = namespaceMethods ? `${namespaceMethods}_${methodName}` : methodName;
    const body: JsonRpcRequest = { jsonrpc: '2.0', id: id++, method, params };

    const deferred = promiseWithResolvers<JsonRpcResponse>();
    queue.push({ request: body, deferred });

    if (typeof sendBatchTimeoutHandle === 'undefined') {
      sendBatchTimeoutHandle = setTimeout(sendBatch, batchWindowMS);
    }

    log.debug(format(`request`, method, params));
    const response = await deferred.promise;
    log.debug(format(`result`, method, response));

    if ('error' in response) {
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
