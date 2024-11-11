import type http from 'http';

import { type ApiSchemaFor } from '../../schemas/api.js';
import { makeFetch } from '../client/fetch.js';
import { createSafeJsonRpcClient } from '../client/safe_json_rpc_client.js';
import { startHttpRpcServer } from '../server/safe_json_rpc_server.js';
import { type SafeJsonRpcServer, createSafeJsonRpcServer } from '../server/safe_json_rpc_server.js';

export type JsonRpcTestContext<T extends object> = {
  server: SafeJsonRpcServer;
  client: T;
  httpServer: http.Server & { port: number };
};

export async function createJsonRpcTestSetup<T extends object>(
  handler: T,
  schema: ApiSchemaFor<T>,
): Promise<JsonRpcTestContext<T>> {
  const server = createSafeJsonRpcServer<T>(handler, schema);
  const httpServer = await startHttpRpcServer(server, { host: '127.0.0.1' });
  const noRetryFetch = makeFetch([], true);
  const client = createSafeJsonRpcClient<T>(`http://127.0.0.1:${httpServer.port}`, schema, false, false, noRetryFetch);
  return { server, client, httpServer };
}
