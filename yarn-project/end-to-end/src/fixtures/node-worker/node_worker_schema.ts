import { AztecNodeAdminApiSchema, AztecNodeApiSchema, AztecNodeDebugApiSchema } from '@aztec/stdlib/interfaces/client';

import { z } from 'zod';

/**
 * Combined RPC schema for the node worker transport — a flat merge of {@link AztecNodeApiSchema},
 * {@link AztecNodeAdminApiSchema}, and {@link AztecNodeDebugApiSchema}, plus a worker-internal
 * `stop` method used by {@link NodeWorker.stop} to drain native resources before terminating.
 *
 * A flat schema parallels the `WorkerWallet` pattern and is safe here because `AztecNodeService`
 * implements all three public interfaces on a single instance; method names do not collide.
 */
export const NodeWorkerSchema = {
  ...AztecNodeApiSchema,
  ...AztecNodeAdminApiSchema,
  ...AztecNodeDebugApiSchema,
  stop: z.function().returns(z.void()),
};
