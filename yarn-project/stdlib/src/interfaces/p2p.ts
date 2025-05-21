import { z } from 'zod';

import { BlockAttestation } from '../p2p/block_attestation.js';
import type { P2PClientType } from '../p2p/client_type.js';
import { type ApiSchemaFor, optional, schemas } from '../schemas/index.js';
import { Tx } from '../tx/tx.js';

export type PeerInfo =
  | { status: 'connected'; score: number; id: string }
  | { status: 'dialing'; dialStatus: string; id: string; addresses: string[] }
  | { status: 'cached'; id: string; addresses: string[]; enr: string; dialAttempts: number };

const PeerInfoSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('connected'), score: z.number(), id: z.string() }),
  z.object({ status: z.literal('dialing'), dialStatus: z.string(), id: z.string(), addresses: z.array(z.string()) }),
  z.object({
    status: z.literal('cached'),
    id: z.string(),
    addresses: z.array(z.string()),
    enr: z.string(),
    dialAttempts: z.number(),
  }),
]);

/** Exposed API to the P2P module. */
export interface P2PApiWithoutAttestations {
  /**
   * Returns all pending transactions in the transaction pool.
   * @returns An array of Txs.
   */
  getPendingTxs(): Promise<Tx[]>;

  /** Returns the number of pending txs in the p2p tx pool. */
  getPendingTxCount(): Promise<number>;

  /**
   * Returns the ENR for this node, if any.
   */
  getEncodedEnr(): Promise<string | undefined>;

  /**
   * Returns info for all connected, dialing, and cached peers.
   */
  getPeers(includePending?: boolean): Promise<PeerInfo[]>;
}

export interface P2PClient extends P2PApiWithoutAttestations {
  /**
   * Queries the Attestation pool for attestations for the given slot
   *
   * @param slot - the slot to query
   * @param proposalId - the proposal id to query, or undefined to query all proposals for the slot
   * @returns BlockAttestations
   */
  getAttestationsForSlot(slot: bigint, proposalId?: string): Promise<BlockAttestation[]>;

  /** Manually adds an attestation to the p2p client attestation pool. */
  addAttestation(attestation: BlockAttestation): Promise<void>;
}

export type P2PApi<T extends P2PClientType = P2PClientType.Full> = T extends P2PClientType.Full
  ? P2PClient & P2PApiWithoutAttestations
  : P2PApiWithoutAttestations;

export const P2PApiSchema: ApiSchemaFor<P2PApi> = {
  getAttestationsForSlot: z
    .function()
    .args(schemas.BigInt, optional(z.string()))
    .returns(z.array(BlockAttestation.schema)),
  getPendingTxs: z.function().returns(z.array(Tx.schema)),
  getPendingTxCount: z.function().returns(schemas.Integer),
  getEncodedEnr: z.function().returns(z.string().optional()),
  getPeers: z.function().args(optional(z.boolean())).returns(z.array(PeerInfoSchema)),
  addAttestation: z.function().args(BlockAttestation.schema).returns(z.void()),
};
