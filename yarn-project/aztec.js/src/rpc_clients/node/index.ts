import { type PXE } from '@aztec/circuit-types';
import { type DebugLogger } from '@aztec/foundation/log';
import { NoRetryError, makeBackoff, retry } from '@aztec/foundation/retry';

import axios, { type AxiosError, type AxiosResponse } from 'axios';

import { createPXEClient } from '../pxe_client.js';

/**
 * A fetch implementation using axios.
 * @param host - The URL of the host.
 * @param rpcMethod - The RPC method to call.
 * @param body - The body of the request.
 * @param useApiEndpoints - Whether to use the API endpoints or inject the method in the body.
 * @returns The response data.
 */
async function axiosFetch(host: string, rpcMethod: string, body: any, useApiEndpoints: boolean) {
  let resp: AxiosResponse;
  if (useApiEndpoints) {
    resp = await axios
      .post(`${host}/${rpcMethod}`, body, {
        headers: { 'content-type': 'application/json' },
      })
      .catch((error: AxiosError) => {
        if (error.response) {
          return error.response;
        }
        throw error;
      });
  } else {
    resp = await axios
      .post(
        host,
        { ...body, method: rpcMethod },
        {
          headers: { 'content-type': 'application/json' },
        },
      )
      .catch((error: AxiosError) => {
        if (error.response) {
          return error.response;
        }
        throw error;
      });
  }

  const isOK = resp.status >= 200 && resp.status < 300;
  if (isOK) {
    return resp.data;
  } else {
    const errorMessage = `(JSON-RPC PROPAGATED) (host ${host}) (method ${rpcMethod}) (code ${resp.status}) ${resp.data.error.message}`;
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
export function createCompatibleClient(rpcUrl: string, logger: DebugLogger): Promise<PXE> {
  // Use axios due to timeout issues with fetch when proving TXs.
  const fetch = async (host: string, rpcMethod: string, body: any, useApiEndpoints: boolean) => {
    return await retry(
      () => axiosFetch(host, rpcMethod, body, useApiEndpoints),
      `JsonRpcClient request ${rpcMethod} to ${host}`,
      makeBackoff([1, 2, 3]),
      logger,
      false,
    );
  };
  const pxe = createPXEClient(rpcUrl, fetch);

  return Promise.resolve(pxe);
}
