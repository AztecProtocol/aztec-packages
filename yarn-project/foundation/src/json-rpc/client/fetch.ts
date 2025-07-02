import { format, inspect } from 'util';

import { type Logger, createLogger } from '../../log/index.js';
import { NoRetryError, makeBackoff, retry } from '../../retry/index.js';
import { jsonStringify } from '../convert.js';

const log = createLogger('json-rpc:json_rpc_client');

export type JsonRpcFetch = (
  host: string,
  body: any,
  extraHeaders?: Record<string, string>,
  noRetry?: boolean,
) => Promise<{ response: any; headers: { get: (header: string) => string | null | undefined } }>;

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
  body: unknown,
  extraHeaders: Record<string, string> = {},
  noRetry = false,
): Promise<{ response: any; headers: { get: (header: string) => string | null | undefined } }> {
  log.debug(format(`JsonRpcClient.fetch`, host, '->', body));
  let resp: Response;
  try {
    resp = await fetch(host, {
      method: 'POST',
      body: jsonStringify(body),
      headers: { 'content-type': 'application/json', ...extraHeaders },
    });
  } catch (err) {
    const errorMessage = `Error fetching from host ${host}: ${inspect(err)}`;
    throw new Error(errorMessage);
  }

  let responseJson;
  try {
    responseJson = await resp.json();
  } catch {
    if (!resp.ok) {
      throw new Error(resp.statusText);
    }
    throw new Error(`Failed to parse body as JSON: ${await resp.text()}`);
  }

  if (!resp.ok) {
    const errorMessage = `Error ${resp.status} from server ${host}: ${responseJson.error.message}`;
    if (noRetry || (resp.status >= 400 && resp.status < 500)) {
      throw new NoRetryError(errorMessage);
    } else {
      throw new Error(errorMessage);
    }
  }

  return { response: responseJson, headers: resp.headers };
}

/**
 * Makes a fetch function that retries based on the given attempts.
 * @param retries - Sequence of intervals (in seconds) to retry.
 * @param noRetry - Whether to stop retries on server errors.
 * @param log - Optional logger for logging attempts.
 * @returns A fetch function.
 */
export function makeFetch(retries: number[], defaultNoRetry: boolean, log?: Logger): typeof defaultFetch {
  return async (host: string, body: unknown, extraHeaders: Record<string, string> = {}, noRetry?: boolean) => {
    return await retry(
      () => defaultFetch(host, body, extraHeaders, noRetry ?? defaultNoRetry),
      `JsonRpcClient request to ${host}`,
      makeBackoff(retries),
      log,
      false,
    );
  };
}
