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

/** Asynchronous cookie storage. */
export interface CookieJar {
  getCookieString(url: string): Promise<string>;
  setCookie(cookie: string, url: string): Promise<unknown>;
}

/**
 * Creates an Undici JSON-RPC transport.
 * @param client - Dispatcher used to make requests.
 * @param cookieJar - Optional application-owned cookie storage. Cookies are ignored when omitted.
 * @returns A JSON-RPC fetch implementation.
 */
export function makeUndiciFetch(client: Dispatcher = new Agent(), cookieJar?: CookieJar): JsonRpcFetch {
  return async (host: string, body: unknown, extraHeaders: Record<string, string> = {}, noRetry = false) => {
    log.trace(`JsonRpcClient.fetch: ${host}`, { host, body });
    const requestUrl = new URL(host);
    requestUrl.hash = '';
    let resp: Dispatcher.ResponseData;
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(extraHeaders)) {
        headers.append(name, value);
      }
      const cookie = await cookieJar?.getCookieString(requestUrl.href);
      if (cookie) {
        headers.append('cookie', cookie);
      }
      const jsonBody = Buffer.from(jsonStringify(body));
      const shouldCompress = jsonBody.length >= COMPRESSION_THRESHOLD;
      headers.set('content-type', 'application/json');
      if (shouldCompress) {
        headers.set('content-encoding', 'gzip');
      }
      headers.set('accept-encoding', 'gzip');
      const requestHeaders: string[] = [];
      headers.forEach((value, name) => requestHeaders.push(name, value));
      resp = await client.request({
        method: 'POST',
        origin: requestUrl.origin,
        path: `${requestUrl.pathname}${requestUrl.search}`,
        body: shouldCompress ? await gzip(jsonBody) : jsonBody,
        headers: requestHeaders,
      });
    } catch (err) {
      const errorMessage = `Error fetching from host ${host}: ${String(err)}`;
      throw new Error(errorMessage);
    }

    let responseJson: any;
    const responseOk = resp.statusCode >= 200 && resp.statusCode <= 299;
    const contentEncoding = resp.headers['content-encoding'];
    let responseText: string;
    try {
      if (contentEncoding === 'gzip') {
        const jsonBuffer = await gunzip(await resp.body.arrayBuffer());
        responseText = jsonBuffer.toString('utf-8');
      } else {
        responseText = await resp.body.text();
      }
    } catch (err) {
      if (!responseOk) {
        throw new Error('HTTP ' + resp.statusCode);
      }
      throw new Error(`Failed to read response body. encoding: ${contentEncoding}, error: ${String(err)}`);
    }

    if (cookieJar) {
      const setCookieHeaders = resp.headers['set-cookie'];
      const cookies = typeof setCookieHeaders === 'string' ? [setCookieHeaders] : (setCookieHeaders ?? []);
      for (const cookie of cookies) {
        await cookieJar.setCookie(cookie, requestUrl.href);
      }
    }

    try {
      responseJson = JSON.parse(responseText);
    } catch {
      if (!responseOk) {
        throw new Error('HTTP ' + resp.statusCode);
      }
      throw new Error(`Failed to parse body as JSON. encoding: ${contentEncoding}, body: ${responseText}`);
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
