import { createSafeJsonRpcClient, defaultFetch } from '@aztec/foundation/json-rpc/client';

import { z } from 'zod';

import { type ApiSchemaFor, schemas } from '../schemas/schemas.js';
import { type ComponentsVersions, getVersioningResponseHandler } from '../versioning/index.js';

/**
 * Role of an L1 tx publisher inside the node. Used by the delayer debug RPCs to select which
 * underlying publisher (sequencer or prover-node) the call targets.
 */
export const L1TxDelayerRoles = ['sequencer', 'prover'] as const;
export type L1TxDelayerRole = (typeof L1TxDelayerRoles)[number];
export const L1TxDelayerRoleSchema = z.enum(L1TxDelayerRoles);

const Hex = z.custom<`0x${string}`>(val => typeof val === 'string' && /^0x[0-9a-fA-F]*$/.test(val));

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
   * Delays the next L1 tx that the given role's publisher sends so it lands at or after `timestamp`.
   * Subsequent txs are unaffected — each call delays only the next one.
   * @throws If the delayer for the role is not enabled.
   */
  pauseNextL1TxUntilTimestamp(role: L1TxDelayerRole, timestamp: bigint): Promise<void>;

  /**
   * Delays the next L1 tx that the given role's publisher sends so it lands at or after `blockNumber`.
   * @throws If the delayer for the role is not enabled.
   */
  pauseNextL1TxUntilBlock(role: L1TxDelayerRole, blockNumber: bigint): Promise<void>;

  /**
   * Cancels (silently drops) the next L1 tx the given role's publisher attempts to send.
   * @throws If the delayer for the role is not enabled.
   */
  cancelNextL1Tx(role: L1TxDelayerRole): Promise<void>;

  /**
   * Returns the hashes of L1 txs successfully sent by the given role's publisher since node start.
   * @throws If the delayer for the role is not enabled.
   */
  getSentL1TxHashes(role: L1TxDelayerRole): Promise<`0x${string}`[]>;

  /**
   * Returns the raw hex for L1 txs that were cancelled by the given role's publisher since node start.
   * @throws If the delayer for the role is not enabled.
   */
  getCancelledL1Txs(role: L1TxDelayerRole): Promise<`0x${string}`[]>;
}

export const AztecNodeDebugApiSchema: ApiSchemaFor<AztecNodeDebug> = {
  mineBlock: z.function().returns(z.void()),
  pauseNextL1TxUntilTimestamp: z.function().args(L1TxDelayerRoleSchema, schemas.BigInt).returns(z.void()),
  pauseNextL1TxUntilBlock: z.function().args(L1TxDelayerRoleSchema, schemas.BigInt).returns(z.void()),
  cancelNextL1Tx: z.function().args(L1TxDelayerRoleSchema).returns(z.void()),
  getSentL1TxHashes: z.function().args(L1TxDelayerRoleSchema).returns(z.array(Hex)),
  getCancelledL1Txs: z.function().args(L1TxDelayerRoleSchema).returns(z.array(Hex)),
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
