import { type DiagnosticsMiddleware } from '@aztec/foundation/json-rpc/server';
import { type Span, SpanStatusCode, type TelemetryClient } from '@aztec/telemetry-client';

export function jsonRpcTelemetryMiddleware(client: TelemetryClient, name = 'SafeJsonRpcServer'): DiagnosticsMiddleware {
  const tracer = client.getTracer(name);

  return async (ctx, next) => {
    return tracer.startActiveSpan('JsonRpcCall', async (span: Span): Promise<void> => {
      if (ctx.id) {
        span.setAttribute('jsonrpc_id', ctx.id);
      }
      span.setAttribute('jsonrpc_method', ctx.method);

      try {
        await next();
        span.setStatus({
          code: SpanStatusCode.OK,
        });
      } catch (err) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: String(err),
        });
      } finally {
        span.end();
      }
    });
  };
}
