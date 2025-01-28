import { defaultFetch } from '@aztec/foundation/json-rpc/client';
import { type Logger } from '@aztec/foundation/log';
import { makeBackoff, retry } from '@aztec/foundation/retry';

import { SpanKind, SpanStatusCode, context, propagation } from '@opentelemetry/api';

import { getTelemetryClient } from '../start.js';
import { ATTR_JSONRPC_METHOD, ATTR_JSONRPC_REQUEST_ID } from '../vendor/attributes.js';

/**
 * Makes a fetch function that retries based on the given attempts and propagates trace information.
 * @param retries - Sequence of intervals (in seconds) to retry.
 * @param noRetry - Whether to stop retries on server errors.
 * @param log - Optional logger for logging attempts.
 * @returns A fetch function.
 */
export function makeTracedFetch(retries: number[], defaultNoRetry: boolean, log?: Logger) {
  return (
    host: string,
    rpcMethod: string,
    body: any,
    useApiEndpoints: boolean,
    extraHeaders: Record<string, string> = {},
    noRetry?: boolean,
  ) => {
    const telemetry = getTelemetryClient();
    return telemetry
      .getTracer('fetch')
      .startActiveSpan(`JsonRpcClient.${rpcMethod}`, { kind: SpanKind.CLIENT }, async span => {
        try {
          if (body && typeof body.id === 'number') {
            span.setAttribute(ATTR_JSONRPC_REQUEST_ID, body.id);
          }
          span.setAttribute(ATTR_JSONRPC_METHOD, rpcMethod);
          const headers = { ...extraHeaders };
          propagation.inject(context.active(), headers);
          return await retry(
            () => defaultFetch(host, rpcMethod, body, useApiEndpoints, headers, noRetry ?? defaultNoRetry),
            `JsonRpcClient request ${rpcMethod} to ${host}`,
            makeBackoff(retries),
            log,
            false,
          );
        } catch (err: any) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: err?.message ?? String(err) });
          throw err;
        } finally {
          span.end();
        }
      });
  };
}
