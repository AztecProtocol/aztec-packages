import { promisify } from 'node:util';
import { gunzip as gunzipCb, gzip as gzipCb } from 'node:zlib';
import { Agent, type Dispatcher } from 'undici';

import { createLogger } from '../../log/pino-logger.js';
import { NoRetryError } from '../../retry/index.js';
import { jsonStringify } from '../convert.js';
import type { JsonRpcFetch } from './fetch.js';

const gzip = promisify(gzipCb);
const gunzip = promisify(gunzipCb);

const log = createLogger('json-rpc:json_rpc_client:undici');

/** Minimum request size in bytes to trigger compression. */
const COMPRESSION_THRESHOLD = 1024;

export { Agent };

export function makeUndiciFetch(client = new Agent()): JsonRpcFetch {
  return async (host: string, body: unknown, extraHeaders: Record<string, string> = {}, noRetry = false) => {
    log.trace(`JsonRpcClient.fetch: ${host}`, { host, body });
    let resp: Dispatcher.ResponseData;
    try {
      const jsonBody = Buffer.from(jsonStringify(body));
      const shouldCompress = jsonBody.length >= COMPRESSION_THRESHOLD;
      resp = await client.request({
        method: 'POST',
        origin: new URL(host),
        path: '/',
        body: shouldCompress ? await gzip(jsonBody) : jsonBody,
        headers: {
          ...extraHeaders,
          'content-type': 'application/json',
          ...(shouldCompress && { 'content-encoding': 'gzip' }),
          'accept-encoding': 'gzip',
        },
      });
    } catch (err) {
      const errorMessage = `Error fetching from host ${host}: ${String(err)}`;
      throw new Error(errorMessage);
    }

    let responseJson: any;
    const responseOk = resp.statusCode >= 200 && resp.statusCode <= 299;
    const contentEncoding = resp.headers['content-encoding'];
    try {
      if (contentEncoding === 'gzip') {
        const jsonBuffer = await gunzip(await resp.body.arrayBuffer());
        responseJson = JSON.parse(jsonBuffer.toString('utf-8'));
      } else {
        responseJson = await resp.body.json();
      }
    } catch {
      if (!responseOk) {
        throw new Error('HTTP ' + resp.statusCode);
      }
      throw new Error(`Failed to parse body as JSON. encoding: ${contentEncoding}, body: ${await resp.body.text()}`);
    }

    if (!responseOk) {
      const errorMessage = `Error ${resp.statusCode} response from server ${host}: ${responseJson}`;
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
