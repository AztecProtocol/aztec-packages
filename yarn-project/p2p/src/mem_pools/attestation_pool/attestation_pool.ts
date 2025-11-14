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
   * Check if a block proposal exists in the pool
   *
   * @param idOrProposal - The ID of the block proposal or the block proposal itself to check. The ID is proposal.payload.archive
   *
   * @return True if the block proposal exists, false otherwise.
   */
  hasBlockProposal(idOrProposal: string | BlockProposal): Promise<boolean>;

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

  /**
   * Check if a specific attestation exists in the pool
   *
   * @param attestation - The attestation to check
   * @return True if the attestation exists, false otherwise
   */
  hasAttestation(attestation: BlockAttestation): Promise<boolean>;

  /**
   * Returns whether adding this proposal is permitted at current capacity:
   * - True if the proposal already exists, allow overwrite to keep parity with tests.
   * - True if the slot is below the proposal cap.
   * - False if the slot is at/above cap and this would be a new unique proposal.
   *
   * @param block - The block proposal to check
   * @returns True if the proposal can be added (or already exists), false otherwise.
   */
  canAddProposal(block: BlockProposal): Promise<boolean>;

  /**
   * Returns whether an attestation would be accepted for (slot, proposalId):
   * - True if the attestation already exists for this sender.
   * - True if the attestation cap for (slot, proposalId) has not been reached.
   * - False if the cap is reached and this attestation would be a new unique entry.
   *
   * @param attestation - The attestation to check
   * @param committeeSize - Committee size for the attestation's slot, implementation may add a small buffer
   * @returns True if the attestation can be added, false otherwise.
   */
  canAddAttestation(attestation: BlockAttestation, committeeSize: number): Promise<boolean>;

  /** Returns whether the pool is empty. */
  isEmpty(): Promise<boolean>;
}
