import { type CheckpointNumber, CheckpointNumberSchema } from '@aztec/foundation/branded-types';
import { createSafeJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';

import { z } from 'zod';

import { type ApiSchemaFor, optional } from '../schemas/schemas.js';
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

  /**
   * Synthetically proves the L2 chain up to the given checkpoint (default: the latest checkpointed
   * checkpoint), writing epoch out hashes into the L1 Outbox so L2-to-L1 messages become consumable
   * and advancing the rollup's proven tip. There is no real proof — this is the local-network
   * equivalent of an epoch proof landing on L1. The target is clamped to the latest checkpointed
   * checkpoint and the call no-ops when it is already proven.
   *
   * @param upToCheckpoint - Checkpoint to prove up to; defaults to the latest checkpointed checkpoint.
   * @returns The proven checkpoint number after the call.
   * @throws If no automine sequencer is running (only the automine sequencer supports synthetic proving).
   */
  prove(upToCheckpoint?: CheckpointNumber): Promise<CheckpointNumber>;
}

export const AztecNodeDebugApiSchema: ApiSchemaFor<AztecNodeDebug> = {
  mineBlock: z.function({ input: z.tuple([]), output: z.void() }),
  prove: z.function({ input: z.tuple([optional(CheckpointNumberSchema)]), output: CheckpointNumberSchema }),
};

export function createAztecNodeDebugClient(
  url: string,
  versions: Partial<ComponentsVersions> = {},
  fetch = defaultFetch,
  apiKey?: string,
): AztecNodeDebug {
  return createSafeJsonRpcClient<AztecNodeDebug>(url, AztecNodeDebugApiSchema, {
    namespaceMethods: 'aztecDebug',
    fetch,
    onResponse: getVersioningResponseHandler(versions),
    ...(apiKey ? { extraHeaders: { 'x-api-key': apiKey } } : {}),
  });
}
