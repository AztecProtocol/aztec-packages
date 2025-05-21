import { jsonStringify } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { NoRetryError, makeBackoff, retry } from '@aztec/foundation/retry';
import type { PXE } from '@aztec/stdlib/interfaces/client';
import type { ComponentsVersions } from '@aztec/stdlib/versioning';

import { Axios, type AxiosError } from 'axios';
import { inspect } from 'util';

import { createPXEClient } from '../pxe_client.js';

/**
 * A fetch implementation using axios.
 * @param host - The URL of the host.
 * @param rpcMethod - The RPC method to call.
 * @param body - The body of the request.
 * @returns The response data.
 */
async function axiosFetch(host: string, body: unknown) {
  const request = new Axios({
    headers: { 'content-type': 'application/json' },
    transformRequest: [(data: any) => jsonStringify(data)],
    transformResponse: [(data: any) => JSON.parse(data)],
  });
  const [url, content] = [host, body];
  const resp = await request.post(url, content).catch((error: AxiosError) => {
    if (error.response) {
      return error.response;
    }
    const errorMessage = `Error fetching from host ${host}: ${inspect(error)}`;
    throw new Error(errorMessage);
  });

  const isOK = resp.status >= 200 && resp.status < 300;
  if (isOK) {
    const headers = {
      get: (header: string) =>
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
        typeof resp.headers.get === 'function' ? resp.headers.get(header)?.toString() : undefined,
    };
    return { response: resp.data, headers };
  } else {
    const errorMessage = `Error ${resp.status} from json-rpc server ${host}: ${resp.data}`;
    if (resp.status >= 400 && resp.status < 500) {
      throw new NoRetryError(errorMessage);
    } else {
      throw new Error(errorMessage);
    }
  }
}

/**
 * Creates a PXE client with a given set of retries on non-server errors.
 * Checks that PXE matches the expected version, and warns if not.
 * @param rpcUrl - URL of the RPC server wrapping the PXE.
 * @param _logger - Debug logger to warn version incompatibilities.
 * @returns A PXE client.
 */
export function createCompatibleClient(
  rpcUrl: string,
  logger: Logger = createLogger('aztecjs:pxe_client'),
  versions: Partial<ComponentsVersions> = {},
): Promise<PXE> {
  // Use axios due to timeout issues with fetch when proving TXs.
  const fetch = async (host: string, body: unknown) => {
    return await retry(
      () => axiosFetch(host, body),
      `JsonRpcClient request to ${host}`,
      makeBackoff([1, 2, 3]),
      logger,
      false,
    );
  };
  const pxe = createPXEClient(rpcUrl, versions, fetch);

  return Promise.resolve(pxe);
}
