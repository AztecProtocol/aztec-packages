import type { BlockAttestation, BlockProposal } from '@aztec/stdlib/p2p';

/**
 * An Attestation Pool contains attestations collected by a validator
 *
 * Attestations that are observed via the p2p network are stored for requests
 * from the validator to produce a block, or to serve to other peers.
 */
export interface AttestationPool {
  /**
   * Adds new block proposal to the pool
   */
  addBlockProposal(blockProposal: BlockProposal): Promise<void>;

  /**
   * Get block proposal by it's ID
   *
   * @param id - The ID of the block proposal to retrieve. The ID is proposal.payload.archive
   *
   * @return The block proposal if it exists, otherwise undefined.
   */
  getBlockProposal(id: string): Promise<BlockProposal | undefined>;

  /**
   * AddAttestations
   *
   * @param attestations - Attestations to add into the pool
   */
  addAttestations(attestations: BlockAttestation[]): Promise<void>;

  /**
   * DeleteAttestation
   *
   * @param attestations - Attestations to remove from the pool
   */
  deleteAttestations(attestations: BlockAttestation[]): Promise<void>;

  /**
   * Delete Attestations with a slot number smaller than the given slot
   *
   * Removes all attestations associated with a slot
   *
   * @param slot - The oldest slot to keep.
   */
  deleteAttestationsOlderThan(slot: bigint): Promise<void>;

  /**
   * Delete Attestations for slot
   *
   * Removes all attestations associated with a slot
   *
   * @param slot - The slot to delete.
   */
  deleteAttestationsForSlot(slot: bigint): Promise<void>;

  /**
   * Delete Attestations for slot and proposal
   *
   * Removes all attestations associated with a slot and proposal
   *
   * @param slot - The slot to delete.
   * @param proposalId - The proposal to delete.
   */
  deleteAttestationsForSlotAndProposal(slot: bigint, proposalId: string): Promise<void>;

  /**
   * Get all Attestations for all proposals for a given slot
   *
   * Retrieve all of the attestations observed pertaining to a given slot
   *
   * @param slot - The slot to query
   * @return BlockAttestations
   */
  getAttestationsForSlot(slot: bigint): Promise<BlockAttestation[]>;

  /**
   * Get Attestations for slot and given proposal
   *
   * Retrieve all of the attestations observed pertaining to a given slot
   *
   * @param slot - The slot to query
   * @param proposalId - The proposal to query
   * @return BlockAttestations
   */
  getAttestationsForSlotAndProposal(slot: bigint, proposalId: string): Promise<BlockAttestation[]>;

  /** Returns whether the pool is empty. */
  isEmpty(): Promise<boolean>;
}
