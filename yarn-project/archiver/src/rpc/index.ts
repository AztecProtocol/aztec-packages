import { createSafeJsonRpcClient } from '@aztec/foundation/json-rpc/client';
import { type ArchiverApi, ArchiverApiSchema } from '@aztec/stdlib/interfaces/server';
import { type ComponentsVersions, getVersioningResponseHandler } from '@aztec/stdlib/versioning';
import { makeTracedFetch } from '@aztec/telemetry-client';

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
