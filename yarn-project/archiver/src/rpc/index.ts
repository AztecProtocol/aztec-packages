import { type ArchiverApi, ArchiverApiSchema } from '@aztec/circuit-types';
import { createSafeJsonRpcClient } from '@aztec/foundation/json-rpc/client';
import { createTracedJsonRpcServer, makeTracedFetch } from '@aztec/telemetry-client';

export function createArchiverClient(url: string, fetch = makeTracedFetch([1, 2, 3], true)): ArchiverApi {
  return createSafeJsonRpcClient<ArchiverApi>(url, ArchiverApiSchema, false, 'archiver', fetch);
}

export function createArchiverRpcServer(handler: ArchiverApi) {
  return createTracedJsonRpcServer(handler, ArchiverApiSchema);
}
