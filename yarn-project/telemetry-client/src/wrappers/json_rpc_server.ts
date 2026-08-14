import { type SafeJsonRpcServerOptions, createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import type { ApiSchemaFor } from '@aztec/stdlib/schemas';

import { getOtelJsonRpcServerMetricsMiddleware } from '../json_rpc_server_metrics.js';
import { getOtelJsonRpcDiagnosticsMiddleware, getOtelJsonRpcPropagationMiddleware } from '../otel_propagation.js';

export function createTracedJsonRpcServer<T extends object = any>(
  handler: T,
  schema: ApiSchemaFor<T>,
  options: SafeJsonRpcServerOptions = {},
) {
  const otelDiagnostics = getOtelJsonRpcDiagnosticsMiddleware();
  const diagnostic = options.diagnostic
    ? (ctx: Parameters<typeof otelDiagnostics>[0], next: Parameters<typeof otelDiagnostics>[1]) =>
        options.diagnostic!(ctx, () => otelDiagnostics(ctx, next))
    : otelDiagnostics;
  return createSafeJsonRpcServer(handler, schema, {
    ...options,
    diagnostic,
    middlewares: [
      getOtelJsonRpcServerMetricsMiddleware(),
      ...(options.middlewares ?? []),
      getOtelJsonRpcPropagationMiddleware(),
    ],
  });
}
