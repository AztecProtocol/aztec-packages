import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { BlockProposal, CheckpointAttestation, CheckpointProposalCore } from '@aztec/stdlib/p2p';

/** Result of trying to add a proposal (block or checkpoint) */
export type TryAddProposalResult = {
  /** Whether proposal was added */
  added: boolean;
  /** Whether exact proposal already existed */
  alreadyExists: boolean;
  /** Total proposals for this position - used for duplicate detection */
  totalForPosition: number;
};

/**
 * An Attestation Pool contains attestations collected by a validator
 *
 * Attestations that are observed via the p2p network are stored for requests
 * from the validator to produce a block, or to serve to other peers.
 */
export interface AttestationPool {
  /**
   * Attempts to add a block proposal to the pool.
   *
   * This method performs validation and addition in a single call:
   * - Checks if the proposal already exists (returns alreadyExists: true if so)
   * - Checks if the position has reached the proposal cap (returns added: false if so)
   * - Adds the proposal if validation passes
   *
   * @param blockProposal - The block proposal to add
   * @returns Result indicating whether the proposal was added and duplicate detection info
   */
  tryAddBlockProposal(blockProposal: BlockProposal): Promise<TryAddProposalResult>;

  /**
   * Get block proposal by its ID.
   *
   * @param id - The ID of the block proposal to retrieve. The ID is proposal.payload.archive
   *
   * @return The block proposal if it exists, otherwise undefined.
   */
  getBlockProposal(id: string): Promise<BlockProposal | undefined>;

  /**
   * Attempts to add a checkpoint proposal to the pool.
   *
   * This method performs validation and addition in a single call:
   * - Checks if the proposal already exists (returns alreadyExists: true if so)
   * - Checks if the slot has reached the proposal cap (returns added: false if so)
   * - Adds the proposal if validation passes
   *
   * Note: This method only handles the CheckpointProposalCore. If the original
   * CheckpointProposal contains a lastBlock, the caller should extract it via
   * getBlockProposal() and add it separately via tryAddBlockProposal().
   *
   * @param proposal - The checkpoint proposal core to add
   * @returns Result indicating whether the proposal was added and duplicate detection info
   */
  tryAddCheckpointProposal(proposal: CheckpointProposalCore): Promise<TryAddProposalResult>;

  /**
   * Get checkpoint proposal by its ID.
   *
   * Returns a CheckpointProposalCore (without lastBlock info) since the lastBlock
   * is extracted and stored separately as a BlockProposal when added.
   *
   * @param id - The ID of the checkpoint proposal to retrieve (proposal.archive)
   * @return The checkpoint proposal core if it exists, otherwise undefined.
   */
  getCheckpointProposal(id: string): Promise<CheckpointProposalCore | undefined>;

  /**
   * Add checkpoint attestations to the pool
   *
   * @param attestations - Checkpoint attestations to add into the pool
   */
  addCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void>;

  /**
   * Delete all pool data (attestations, proposals) older than the given slot
   *
   * @param slot - The oldest slot to keep.
   */
  deleteOlderThan(slot: SlotNumber): Promise<void>;

  /**
   * Get all checkpoint attestations for a given slot
   *
   * @param slot - The slot to query
   * @return CheckpointAttestations
   */
  getCheckpointAttestationsForSlot(slot: SlotNumber): Promise<CheckpointAttestation[]>;

  /**
   * Get checkpoint attestations for slot and given proposal
   *
   * @param slot - The slot to query
   * @param proposalId - The proposal to query
   * @return CheckpointAttestations
   */
  getCheckpointAttestationsForSlotAndProposal(slot: SlotNumber, proposalId: string): Promise<CheckpointAttestation[]>;

  /**
   * Check if a specific checkpoint attestation exists in the pool
   *
   * @param attestation - The attestation to check
   * @return True if the attestation exists, false otherwise
   */
  hasCheckpointAttestation(attestation: CheckpointAttestation): Promise<boolean>;

  /**
   * Returns whether a checkpoint attestation would be accepted for (slot, proposalId).
   *
   * @param attestation - The attestation to check
   * @param committeeSize - Committee size for the attestation's slot
   * @returns True if the attestation can be added, false otherwise.
   */
  canAddCheckpointAttestation(attestation: CheckpointAttestation, committeeSize: number): Promise<boolean>;

  /**
   * Returns whether the checkpoint attestation cap for the given slot and proposal has been reached.
   *
   * @param slot - The slot to check
   * @param proposalId - The proposal to check
   * @param committeeSize - Committee size for the slot
   * @returns True if the cap has been reached, false otherwise.
   */
  hasReachedCheckpointAttestationCap(slot: SlotNumber, proposalId: string, committeeSize: number): Promise<boolean>;

  /** Returns whether the pool is empty. */
  isEmpty(): Promise<boolean>;
}
