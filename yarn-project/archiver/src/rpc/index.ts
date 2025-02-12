import {
  type ArchiverApi,
  ArchiverApiSchema,
  type ComponentsVersions,
  getVersioningResponseHandler,
} from '@aztec/circuit-types';
import { createSafeJsonRpcClient } from '@aztec/foundation/json-rpc/client';
import { createTracedJsonRpcServer, makeTracedFetch } from '@aztec/telemetry-client';

export function createArchiverClient(
  url: string,
  versions: Partial<ComponentsVersions>,
  fetch = makeTracedFetch([1, 2, 3], true),
): ArchiverApi {
  return createSafeJsonRpcClient<ArchiverApi>(url, ArchiverApiSchema, {
    namespaceMethods: 'archiver',
    fetch,
    onResponse: getVersioningResponseHandler(versions),
  });
}

export function createArchiverRpcServer(handler: ArchiverApi) {
  return createTracedJsonRpcServer(handler, ArchiverApiSchema);
}
