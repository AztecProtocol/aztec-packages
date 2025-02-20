import { getVersioningResponseHandler } from '@aztec/circuit-types';
import type { ComponentsVersions } from '@aztec/circuit-types';
import { ArchiverApiSchema } from '@aztec/circuit-types/interfaces/server';
import type { ArchiverApi } from '@aztec/circuit-types/interfaces/server';
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
