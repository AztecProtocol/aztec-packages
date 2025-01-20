import { type SafeJsonRpcServerOptions, createSafeJsonRpcServer } from '@aztec/foundation/json-rpc/server';
import { type ApiSchemaFor } from '@aztec/foundation/schemas';

import { getOtelJsonRpcPropagationMiddleware } from '../otel_propagation.js';

export function createTracedJsonRpcServer<T extends object = any>(
  handler: T,
  schema: ApiSchemaFor<T>,
  options: Partial<SafeJsonRpcServerOptions> = {},
) {
  return createSafeJsonRpcServer(handler, schema, {
    ...options,
    middlewares: [...(options.middlewares ?? []), getOtelJsonRpcPropagationMiddleware()],
  });
}
