import { format } from 'util';

import { type DebugLogger, createDebugLogger } from '../../log/index.js';
import { NoRetryError, makeBackoff, retry } from '../../retry/index.js';
import { jsonStringify } from '../convert.js';

const log = createDebugLogger('json-rpc:json_rpc_client');

/**
 * A normal fetch function that does not retry.
 * Alternatives are a fetch function with retries, or a mocked fetch.
 * @param host - The host URL.
 * @param method - The RPC method name.
 * @param body - The RPC payload.
 * @param noRetry - Whether to throw a `NoRetryError` in case the response is a 5xx error and the body contains an error
 *                  message (see `retry` function for more details).
 * @returns The parsed JSON response, or throws an error.
 */
export async function defaultFetch(
  host: string,
  rpcMethod: string,
  body: any,
  useApiEndpoints: boolean,
  noRetry = false,
  stringify = jsonStringify,
) {
  log.debug(format(`JsonRpcClient.fetch`, host, rpcMethod, '->', body));
  let resp: Response;
  if (useApiEndpoints) {
    resp = await fetch(`${host}/${rpcMethod}`, {
      method: 'POST',
      body: stringify(body),
      headers: { 'content-type': 'application/json' },
    });
  } else {
    resp = await fetch(host, {
      method: 'POST',
      body: stringify({ ...body, method: rpcMethod }),
      headers: { 'content-type': 'application/json' },
    });
  }

  let responseJson;
  try {
    responseJson = await resp.json();
  } catch (err) {
    if (!resp.ok) {
      throw new Error(resp.statusText);
    }
    throw new Error(`Failed to parse body as JSON: ${resp.text()}`);
  }

  if (!resp.ok) {
    const errorMessage = `(JSON-RPC PROPAGATED) (host ${host}) (method ${rpcMethod}) (code ${resp.status}) ${responseJson.error.message}`;
    if (noRetry || (resp.status >= 400 && resp.status < 500)) {
      throw new NoRetryError(errorMessage);
    } else {
      throw new Error(errorMessage);
    }
  }

  return responseJson;
}

/**
 * Makes a fetch function that retries based on the given attempts.
 * @param retries - Sequence of intervals (in seconds) to retry.
 * @param noRetry - Whether to stop retries on server errors.
 * @param log - Optional logger for logging attempts.
 * @returns A fetch function.
 */
export function makeFetch(retries: number[], defaultNoRetry: boolean, log?: DebugLogger) {
  return async (
    host: string,
    rpcMethod: string,
    body: any,
    useApiEndpoints: boolean,
    noRetry?: boolean,
    stringify = jsonStringify,
  ) => {
    return await retry(
      () => defaultFetch(host, rpcMethod, body, useApiEndpoints, noRetry ?? defaultNoRetry, stringify),
      `JsonRpcClient request ${rpcMethod} to ${host}`,
      makeBackoff(retries),
      log,
      false,
    );
  };
}
