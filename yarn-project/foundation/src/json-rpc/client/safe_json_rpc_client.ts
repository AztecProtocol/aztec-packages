import { format } from 'util';

import { type Logger, createLogger } from '../../log/pino-logger.js';
import { type PromiseWithResolvers, promiseWithResolvers } from '../../promise/utils.js';
import { type ApiSchema, type ApiSchemaFor, schemaHasMethod } from '../../schemas/api.js';
import { type JsonRpcFetch, defaultFetch } from './fetch.js';

// batch window of 0 would capture all requests in the current sync iteration of the event loop
// and send them all at once in a single batch
// minimal latency
const DEFAULT_BATCH_WINDOW_MS = 0;

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

// expose helpful information on the RPC clients such that we can recognize them later
const SEND_BATCH = Symbol('JsonRpcClient.sendBatch');
const CLIENT_ID = Symbol('JsonRpcClient.clientId');

let nextClientId = 1;
// keep a reference to clients so that we can force send a batch
const clients = new Map<number, WeakRef<{ [SEND_BATCH]: () => Promise<void> }>>();

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
    if (sendBatchTimeoutHandle !== undefined) {
      clearTimeout(sendBatchTimeoutHandle);
      sendBatchTimeoutHandle = undefined;
    }

    const rpcCalls = queue;
    queue = [];

    if (rpcCalls.length === 0) {
      return;
    }

    log.debug(`Executing JSON-RPC batch of size: ${rpcCalls.length}`, {
      methods: rpcCalls.map(({ request }) => request.method),
    });
    try {
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
              message: response.message ?? 'Failed request',
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
    } catch (err) {
      log.warn(`Failed to fetch from the remote server`, err);
      for (let i = 0; i < rpcCalls.length; i++) {
        const { request, deferred } = rpcCalls[i];
        deferred.resolve({
          id: request.id,
          jsonrpc: '2.0',
          error: {
            code: -32000,
            data: err,
            message: (err as any).message ?? 'Failed request',
          },
        });
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

    if (sendBatchTimeoutHandle === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      sendBatchTimeoutHandle = setTimeout(sendBatch, batchWindowMS);
    }

    log.debug(format(`request`, method, params));
    const response = await deferred.promise;
    log.debug(format(`result`, method, response));

    if ('error' in response) {
      throw new Error(response.error.message, { cause: response.error });
    }
    // TODO(palla/schemas): Find a better way to handle null responses (JSON.stringify(null) is string "null").
    if ([null, undefined, 'null', 'undefined'].includes(response.result)) {
      return;
    }
    return (schema as ApiSchema)[methodName].returnType().parseAsync(response.result);
  };

  const clientId = nextClientId++;
  const proxy: any = { [CLIENT_ID]: clientId, [SEND_BATCH]: sendBatch };
  for (const method of Object.keys(schema)) {
    // attach the clientId to the promise so that if we want to trigger a batch immediately, we can do that
    proxy[method] = (...params: any[]) => Object.assign(request(method, params), { [CLIENT_ID]: clientId });
  }

  clients.set(clientId, new WeakRef(proxy));

  return proxy as T;
}

/**
 * Triggers a batch to be sent immediately
 */
export async function batch<T extends readonly unknown[]>(
  values: T,
): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }> {
  const clientIdsSeen = new Set<number>();

  await Promise.allSettled(
    values.map(val => {
      if (typeof val === 'object' && val && Object.hasOwn(val, CLIENT_ID)) {
        const clientId = (val as { [CLIENT_ID]: any })[CLIENT_ID];
        if (typeof clientId === 'number') {
          if (clientIdsSeen.has(clientId)) {
            return;
          }

          clientIdsSeen.add(clientId);
          const client = clients.get(clientId)?.deref();
          if (client) {
            return client[SEND_BATCH]();
          }
        }
      }
    }),
  );

  return Promise.all(values);
}
