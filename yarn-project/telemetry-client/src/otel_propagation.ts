import type { DiagnosticsMiddleware } from '@aztec/foundation/json-rpc/server';

import { ROOT_CONTEXT, type Span, SpanKind, SpanStatusCode, propagation } from '@opentelemetry/api';
import type Koa from 'koa';

import { getTelemetryClient } from './start.js';
import {
  ATTR_JSONRPC_ERROR_CODE,
  ATTR_JSONRPC_ERROR_MSG,
  ATTR_JSONRPC_METHOD,
  ATTR_JSONRPC_REQUEST_ID,
} from './vendor/attributes.js';

export function getOtelJsonRpcPropagationMiddleware(
  scope = 'JsonRpcServer',
): (ctx: Koa.Context, next: () => Promise<void>) => Promise<void> {
  return function otelJsonRpcPropagation(ctx: Koa.Context, next: () => Promise<void>) {
    const tracer = getTelemetryClient().getTracer(scope);
    const context = propagation.extract(ROOT_CONTEXT, ctx.request.headers);
    const method = (ctx.request.body as any)?.method;
    return tracer.startActiveSpan(
      `JsonRpcServer.${method ?? 'batch'}`,
      { kind: SpanKind.SERVER },
      context,
      async (span: Span): Promise<void> => {
        if (ctx.id) {
          span.setAttribute(ATTR_JSONRPC_REQUEST_ID, ctx.id);
        }
        if (method) {
          span.setAttribute(ATTR_JSONRPC_METHOD, method);
        }

        try {
          await next();
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

export function getOtelJsonRpcDiagnosticsMiddleware(): DiagnosticsMiddleware {
  return function otelJsonRpcDiagnostics(ctx, next) {
    const [namespace, method] = splitNamespace(ctx.method);
    const scope = namespace ?? 'UnknownHandler';
    const tracer = getTelemetryClient().getTracer(scope);
    return tracer.startActiveSpan(
      `${scope}.${method}`,
      { kind: SpanKind.INTERNAL, attributes: { [ATTR_JSONRPC_METHOD]: ctx.method } },
      async span => {
        if (ctx.id !== null) {
          span.setAttribute(ATTR_JSONRPC_REQUEST_ID, ctx.id);
        }

        try {
          await next();
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (err) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
          if (typeof err === 'string' || err instanceof Error) {
            span.recordException(err);
          }
          throw err;
        } finally {
          span.end();
        }
      },
    );
  };
}

function splitNamespace(fullMethod: string): [namespace: string | undefined, method: string] {
  const idx = fullMethod.indexOf('_');
  if (idx > -1) {
    return [fullMethod.slice(0, idx), fullMethod.slice(idx + 1)];
  } else {
    return [undefined, fullMethod];
  }
}
