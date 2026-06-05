import type { CheckpointProposalHash, SlotNumber } from '@aztec/foundation/branded-types';

import { z } from 'zod';

import type { BlockProposal } from '../p2p/block_proposal.js';
import { CheckpointAttestation } from '../p2p/checkpoint_attestation.js';
import type { CheckpointProposalCore } from '../p2p/checkpoint_proposal.js';
import { type ApiSchemaFor, optional, schemas } from '../schemas/index.js';
import { Tx } from '../tx/tx.js';
import { TxHash } from '../tx/tx_hash.js';
import { MAX_RPC_TXS_LEN } from './api_limit.js';
import { type GetTxByHashOptions, GetTxByHashOptionsSchema } from './aztec-node.js';

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
   * Returns all pending transactions in the transaction pool. The txs' proofs are stripped unless
   * `includeProof` is set.
   * @param limit - The number of items to returns
   * @param after - The last known pending tx. Used for pagination
   * @param options - Options for the returned txs (eg whether to include their proofs).
   * @returns An array of Txs.
   */
  getPendingTxs(limit?: number, after?: TxHash, options?: GetTxByHashOptions): Promise<Tx[]>;

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

  /**
   * Queries the Attestation pool for checkpoint attestations for the given slot.
   *
   * @param slot - the slot to query
   * @param proposalPayloadHash - hex-encoded keccak256 of the target proposal's signed
   *        payload (`CheckpointProposal.getPayloadHash()`). When provided, only
   *        attestations whose own signed payload hashes to the same value are returned.
   *        When omitted, all attestations for the slot are returned.
   * @returns CheckpointAttestations
   */
  getCheckpointAttestationsForSlot(
    slot: SlotNumber,
    proposalPayloadHash?: CheckpointProposalHash,
  ): Promise<CheckpointAttestation[]>;
}

export interface P2PClient extends P2PApi {
  /** Manually adds checkpoint attestations to the p2p client attestation pool. */
  addOwnCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void>;

  /** Returns retained signed proposals for a slot. */
  getProposalsForSlot(slot: SlotNumber): Promise<{
    blockProposals: BlockProposal[];
    checkpointProposals: CheckpointProposalCore[];
  }>;
}

export const P2PApiSchema: ApiSchemaFor<P2PApi> = {
  getCheckpointAttestationsForSlot: z.function({
    input: z.tuple([
      schemas.SlotNumber,
      optional(z.string().regex(/^0x[0-9a-fA-F]+$/) as unknown as z.ZodType<CheckpointProposalHash>),
    ]),
    output: z.array(CheckpointAttestation.schema),
  }),
  getPendingTxs: z.function({
    input: z.tuple([
      optional(z.number().gte(1).lte(MAX_RPC_TXS_LEN).default(MAX_RPC_TXS_LEN)),
      optional(TxHash.schema),
      optional(GetTxByHashOptionsSchema),
    ]),
    output: z.array(Tx.schema),
  }),

  getPendingTxCount: z.function({ input: z.tuple([]), output: schemas.Integer }),
  getEncodedEnr: z.function({ input: z.tuple([]), output: z.string().optional() }),
  getPeers: z.function({ input: z.tuple([optional(z.boolean())]), output: z.array(PeerInfoSchema) }),
};
