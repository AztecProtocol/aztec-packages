import type { DiagnosticsMiddleware } from '@aztec/foundation/json-rpc/server';
import { Timer } from '@aztec/foundation/timer';

import { ROOT_CONTEXT, type Span, SpanKind, SpanStatusCode, propagation } from '@opentelemetry/api';
import type Koa from 'koa';

import { getJsonRpcServerMetrics, splitJsonRpcMethod } from './json_rpc_server_metrics.js';
import { getTelemetryClient } from './start.js';
import {
  ATTR_JSONRPC_ERROR_CODE,
  ATTR_JSONRPC_ERROR_MSG,
  ATTR_JSONRPC_METHOD,
  ATTR_JSONRPC_REQUEST_ID,
  ATTR_JSONRPC_SERVICE,
} from './vendor/attributes.js';

export function getOtelJsonRpcPropagationMiddleware(
  scope = 'JsonRpcServer',
): (ctx: Koa.Context, next: () => Promise<void>) => Promise<void> {
  return function otelJsonRpcPropagation(ctx: Koa.Context, next: () => Promise<void>) {
    const tracer = getTelemetryClient().getTracer(scope);
    const context = propagation.extract(ROOT_CONTEXT, ctx.request.headers);
    return tracer.startActiveSpan(
      `JsonRpcServer`,
      { kind: SpanKind.SERVER },
      context,
      async (span: Span): Promise<void> => {
        if (ctx.id) {
          span.setAttribute(ATTR_JSONRPC_REQUEST_ID, ctx.id);
        }

        try {
          await next();
          const requestBody = (ctx.request as { body?: unknown }).body;
          if (
            requestBody &&
            typeof requestBody === 'object' &&
            !Array.isArray(requestBody) &&
            'method' in requestBody
          ) {
            const fullMethod = requestBody.method;
            if (typeof fullMethod === 'string') {
              const [service, method] = splitJsonRpcMethod(fullMethod);
              span.updateName(`JsonRpcServer.${service ? `${service}.` : ''}${method}`);
              span.setAttribute(ATTR_JSONRPC_METHOD, method);
              if (service) {
                span.setAttribute(ATTR_JSONRPC_SERVICE, service);
              }
            }
          } else if (Array.isArray(requestBody)) {
            span.updateName(`JsonRpcServer.batch`);
          }
          const err = (ctx.body as any).error?.message;
          const code = (ctx.body as any).error?.code;
          if (err) {
            span.setStatus({ code: SpanStatusCode.ERROR, message: err });
            span.setAttribute(ATTR_JSONRPC_ERROR_CODE, code);
            span.setAttribute(ATTR_JSONRPC_ERROR_MSG, err);
          } else {
            span.setStatus({ code: SpanStatusCode.OK });
          }
        } catch (err) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(err) });
        } finally {
          span.end();
        }
      },
    );
  };
}

export function getOtelJsonRpcDiagnosticsMiddleware(metricsProvider = getJsonRpcServerMetrics): DiagnosticsMiddleware {
  return function otelJsonRpcDiagnostics(ctx, next) {
    const [service, method] = splitJsonRpcMethod(ctx.method);
    const scope = service ?? 'UnknownHandler';
    const tracer = getTelemetryClient().getTracer(scope);
    const attributes = {
      ...(service === undefined ? {} : { [ATTR_JSONRPC_SERVICE]: service }),
      [ATTR_JSONRPC_METHOD]: method,
    };
    return tracer.startActiveSpan(`${scope}.${method}`, { kind: SpanKind.INTERNAL, attributes }, async span => {
      const timer = new Timer();
      let ok = false;
      if (ctx.id !== null) {
        span.setAttribute(ATTR_JSONRPC_REQUEST_ID, ctx.id);
      }

      try {
        await next();
        ok = true;
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
        if (typeof err === 'string' || err instanceof Error) {
          span.recordException(err);
        }
        throw err;
      } finally {
        const metrics = metricsProvider();
        metrics.recordRequest(ctx.method, timer.ms(), ok);
        if (ctx.requestValidationDurationMs !== undefined && ctx.requestValidationSucceeded !== undefined) {
          metrics.recordRequestValidation(ctx.method, ctx.requestValidationDurationMs, ctx.requestValidationSucceeded);
        }
        span.end();
      }
    });
  };
}
