import type http from 'http';

import type { ApiSchemaFor } from '../../schemas/api.js';
import { makeFetch } from '../client/fetch.js';
import { type SafeJsonRpcClientOptions, createSafeJsonRpcClient } from '../client/safe_json_rpc_client.js';
import {
  type SafeJsonRpcServer,
  type SafeJsonRpcServerOptions,
  createSafeJsonRpcServer,
  startHttpRpcServer,
} from '../server/safe_json_rpc_server.js';

export type JsonRpcTestContext<T extends object> = {
  server: SafeJsonRpcServer;
  client: T;
  httpServer: http.Server & { port: number };
  url: string;
};

export async function createJsonRpcTestSetup<T extends object>(
  handler: T,
  schema: ApiSchemaFor<T>,
  serverOptions: SafeJsonRpcServerOptions = {},
  clientOptions: SafeJsonRpcClientOptions = {},
): Promise<JsonRpcTestContext<T>> {
  const server = createSafeJsonRpcServer<T>(handler, schema, serverOptions);
  const httpServer = await startHttpRpcServer(server, { host: '127.0.0.1' });
  const noRetryFetch = makeFetch([], true);
  const url = `http://127.0.0.1:${httpServer.port}`;
  const client = createSafeJsonRpcClient<T>(url, schema, {
    fetch: noRetryFetch,
    ...clientOptions,
  });
  return { server, client, httpServer, url };
}
