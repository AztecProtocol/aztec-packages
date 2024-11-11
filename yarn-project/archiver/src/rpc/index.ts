import { type ArchiverApi, ArchiverApiSchema } from '@aztec/circuit-types';
import { createSafeJsonRpcClient, makeFetch } from '@aztec/foundation/json-rpc/client';
import { createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';

export function createArchiverClient(url: string, fetch = makeFetch([1, 2, 3], true)): ArchiverApi {
  return createSafeJsonRpcClient<ArchiverApi>(url, ArchiverApiSchema, false, 'archiver', fetch);
}

export function createArchiverRpcServer(handler: ArchiverApi) {
  return createSafeJsonRpcServer(handler, ArchiverApiSchema);
}
