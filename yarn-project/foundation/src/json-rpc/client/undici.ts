import { Agent } from 'undici';
import type { Dispatcher } from 'undici';

import { createLogger } from '../../log/pino-logger.js';
import { NoRetryError } from '../../retry/index.js';
import { jsonStringify } from '../convert.js';
import type { JsonRpcFetch } from './fetch.js';

const log = createLogger('json-rpc:json_rpc_client:undici');

export { Agent };

export function makeUndiciFetch(client = new Agent()): JsonRpcFetch {
  return async (
    host: string,
    rpcMethod: string,
    body: any,
    useApiEndpoints: boolean,
    extraHeaders: Record<string, string> = {},
    noRetry = false,
  ) => {
    log.trace(`JsonRpcClient.fetch: ${host} ${rpcMethod}`, { host, rpcMethod, body });
    let resp: Dispatcher.ResponseData<string>;
    try {
      resp = await client.request<string>({
        method: 'POST',
        origin: new URL(host),
        path: useApiEndpoints ? rpcMethod : '/',
        body: jsonStringify(body),
        headers: {
          ...extraHeaders,
          'content-type': 'application/json',
        },
      });
    } catch (err) {
      const errorMessage = `Error fetching from host ${host} with method ${rpcMethod}: ${String(err)}`;
      throw new Error(errorMessage);
    }

    let responseJson: any;
    const responseOk = resp.statusCode >= 200 && resp.statusCode <= 299;
    try {
      responseJson = await resp.body.json();
    } catch (err) {
      if (!responseOk) {
        throw new Error('HTTP ' + resp.statusCode);
      }
      throw new Error(`Failed to parse body as JSON: ${await resp.body.text()}`);
    }

    if (!responseOk) {
      const errorMessage = `Error ${resp.statusCode} response from server ${host} on ${rpcMethod}: ${responseJson.error.message}`;
      if (noRetry || (resp.statusCode >= 400 && resp.statusCode < 500)) {
        throw new NoRetryError(errorMessage);
      } else {
        throw new Error(errorMessage);
      }
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(resp.headers)) {
      if (typeof value === 'string') {
        headers.append(key, value);
      } else if (Array.isArray(value)) {
        for (const v of value) {
          headers.append(key, v);
        }
      }
    }

    return {
      response: responseJson,
      headers,
    };
  };
}
