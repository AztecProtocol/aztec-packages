import { type ApiSchemaFor, optional, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { BlockAttestation } from '../p2p/block_attestation.js';
import { EpochProofQuote } from '../prover_coordination/epoch_proof_quote.js';
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
export interface P2PApi {
  /**
   * Queries the Attestation pool for attestations for the given slot
   *
   * @param slot - the slot to query
   * @param proposalId - the proposal id to query, or undefined to query all proposals for the slot
   * @returns BlockAttestations
   */
  getAttestationsForSlot(slot: bigint, proposalId?: string): Promise<BlockAttestation[]>;

  /**
   * Queries the EpochProofQuote pool for quotes for the given epoch
   *
   * @param epoch - the epoch to query
   * @returns EpochProofQuotes
   */
  getEpochProofQuotes(epoch: bigint): Promise<EpochProofQuote[]>;

  /**
   * Returns all pending transactions in the transaction pool.
   * @returns An array of Txs.
   */
  getPendingTxs(): Promise<Tx[]>;

  /**
   * Returns the ENR for this node, if any.
   */
  getEncodedEnr(): Promise<string | undefined>;

  /**
   * Returns info for all connected, dialing, and cached peers.
   */
  getPeers(includePending?: boolean): Promise<PeerInfo[]>;
}

export const P2PApiSchema: ApiSchemaFor<P2PApi> = {
  getAttestationsForSlot: z
    .function()
    .args(schemas.BigInt, optional(z.string()))
    .returns(z.array(BlockAttestation.schema)),
  getEpochProofQuotes: z.function().args(schemas.BigInt).returns(z.array(EpochProofQuote.schema)),
  getPendingTxs: z.function().returns(z.array(Tx.schema)),
  getEncodedEnr: z.function().returns(z.string().optional()),
  getPeers: z.function().args(optional(z.boolean())).returns(z.array(PeerInfoSchema)),
};
