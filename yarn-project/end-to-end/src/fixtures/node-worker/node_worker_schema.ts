import { AztecNodeAdminApiSchema, AztecNodeApiSchema, AztecNodeDebugApiSchema } from '@aztec/stdlib/interfaces/client';

/**
 * Combined RPC schema for the node worker transport — a flat merge of {@link AztecNodeApiSchema},
 * {@link AztecNodeAdminApiSchema}, and {@link AztecNodeDebugApiSchema}. Used by both the main-thread
 * client (to validate responses) and the worker server (to dispatch requests).
 *
 * A flat schema parallels the `WorkerWallet` pattern and is safe here because `AztecNodeService`
 * implements all three interfaces on a single instance; method names do not collide.
 */
export const NodeWorkerSchema = {
  ...AztecNodeApiSchema,
  ...AztecNodeAdminApiSchema,
  ...AztecNodeDebugApiSchema,
};
