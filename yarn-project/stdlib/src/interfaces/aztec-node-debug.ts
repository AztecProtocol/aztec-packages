import { type CheckpointNumber, CheckpointNumberSchema } from '@aztec/foundation/branded-types';
import { createSafeJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';

import { z } from 'zod';

import { type ApiSchemaFor, optional } from '../schemas/schemas.js';
import { type ComponentsVersions, getVersioningResponseHandler } from '../versioning/index.js';

const MAX_SIGNATURES_PER_REGISTER_CALL = 100;
const MAX_SIGNATURE_LEN = 10000;

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

  /**
   * Warps L1 time forward to at least `targetTimestamp` and builds an empty L2 checkpoint at the next slot boundary,
   * advancing the L2 timestamp to at least the target. The warp is serialized with block building, so it never
   * interleaves with an in-flight build. A no-op when `targetTimestamp` is already at or behind the current L1 time.
   *
   * @param targetTimestamp - Target L1 timestamp, in seconds.
   * @throws If no automine sequencer is running (only the automine sequencer supports time warps).
   */
  warpL2TimeAtLeastTo(targetTimestamp: number): Promise<void>;

  /**
   * Warps L1 time forward by at least `duration` seconds from the current L1 time and builds an empty L2 checkpoint
   * at the next slot boundary. The warp is serialized with block building, so it never interleaves with an in-flight
   * build.
   *
   * @param duration - Number of seconds to advance; must be positive.
   * @throws If no automine sequencer is running, or if `duration` is not positive.
   */
  warpL2TimeAtLeastBy(duration: number): Promise<void>;

  /**
   * Registers public function signatures so the node can resolve selectors to names in public-execution stack
   * traces. The mapping lives only in unpersisted node memory, is not gossiped, and is exposed here (rather than on
   * the main node API) because it is a debug-only, unauthenticated write that should not be reachable on prod nodes.
   * @param functionSignatures - Decoded `name(paramTypes)` signatures to register by selector.
   */
  registerContractFunctionSignatures(functionSignatures: string[]): Promise<void>;
}

export const AztecNodeDebugApiSchema: ApiSchemaFor<AztecNodeDebug> = {
  mineBlock: z.function({ input: z.tuple([]), output: z.void() }),
  prove: z.function({ input: z.tuple([optional(CheckpointNumberSchema)]), output: CheckpointNumberSchema }),
  warpL2TimeAtLeastTo: z.function({ input: z.tuple([z.number()]), output: z.void() }),
  warpL2TimeAtLeastBy: z.function({ input: z.tuple([z.number()]), output: z.void() }),
  registerContractFunctionSignatures: z.function({
    input: z.tuple([z.array(z.string().max(MAX_SIGNATURE_LEN)).max(MAX_SIGNATURES_PER_REGISTER_CALL)]),
    output: z.void(),
  }),
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
