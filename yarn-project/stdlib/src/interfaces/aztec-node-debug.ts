import { createSafeJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';

import { z } from 'zod';

import type { ApiSchemaFor } from '../schemas/schemas.js';
import { type ComponentsVersions, getVersioningResponseHandler } from '../versioning/index.js';

/**
 * Debug interface for Aztec node available in sandbox/local-network mode.
 */
export interface AztecNodeDebug {
  /**
   * Triggers the sequencer to produce an L2 block and waits for it to appear.
   *
   * **Precondition**: The current L2 slot must not already contain a block. Callers must ensure L1 time has been
   * advanced to a slot with no existing block before calling this method (e.g. via `EthCheatCodes.warp()`).
   * If the slot is already taken, the sequencer will fail to propose and this call will time out.
   *
   * @throws If no sequencer is running.
   */
  mineBlock(): Promise<void>;
}

export const AztecNodeDebugApiSchema: ApiSchemaFor<AztecNodeDebug> = {
  mineBlock: z.function({ input: z.tuple([]), output: z.void() }),
};

export function createAztecNodeDebugClient(
  url: string,
  versions: Partial<ComponentsVersions> = {},
  fetch = defaultFetch,
  apiKey?: string,
): AztecNodeDebug {
  return createSafeJsonRpcClient<AztecNodeDebug>(url, AztecNodeDebugApiSchema, {
    namespaceMethods: 'nodeDebug',
    fetch,
    onResponse: getVersioningResponseHandler(versions),
    ...(apiKey ? { extraHeaders: { 'x-api-key': apiKey } } : {}),
  });
}
