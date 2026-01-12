import type { SlotNumber } from '@aztec/foundation/branded-types';
import type {
  BlockProposal,
  CheckpointAttestation,
  CheckpointProposal,
  CheckpointProposalCore,
} from '@aztec/stdlib/p2p';

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
   * Adds a checkpoint proposal to the pool.
   *
   * If the proposal contains a lastBlock, the BlockProposal is automatically extracted
   * and stored separately via addBlockProposal. The checkpoint proposal is then stored
   * without the lastBlock info (as CheckpointProposalCore).
   *
   * @param proposal - The checkpoint proposal to add
   * @throws ProposalSlotCapExceededError if the slot has reached the maximum number of proposals
   */
  addCheckpointProposal(proposal: CheckpointProposal): Promise<void>;

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
   * Check if a checkpoint proposal exists in the pool
   *
   * @param idOrProposal - The ID of the checkpoint proposal or the proposal itself
   * @return True if the proposal exists, false otherwise.
   */
  hasCheckpointProposal(idOrProposal: string | CheckpointProposal): Promise<boolean>;

  /**
   * Add checkpoint attestations to the pool
   *
   * @param attestations - Checkpoint attestations to add into the pool
   */
  addCheckpointAttestations(attestations: CheckpointAttestation[]): Promise<void>;

  /**
   * Delete checkpoint attestations older than the given slot
   *
   * @param slot - The oldest slot to keep.
   */
  deleteCheckpointAttestationsOlderThan(slot: SlotNumber): Promise<void>;

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
   * Returns whether adding this checkpoint proposal is permitted at current capacity.
   *
   * @param proposal - The checkpoint proposal to check
   * @returns True if the proposal can be added, false otherwise.
   */
  canAddCheckpointProposal(proposal: CheckpointProposal): Promise<boolean>;

  /**
   * Returns whether a checkpoint attestation would be accepted for (slot, proposalId).
   *
   * @param attestation - The attestation to check
   * @param committeeSize - Committee size for the attestation's slot
   * @returns True if the attestation can be added, false otherwise.
   */
  canAddCheckpointAttestation(attestation: CheckpointAttestation, committeeSize: number): Promise<boolean>;

  /**
   * Returns whether the checkpoint proposal cap for the given slot has been reached.
   *
   * @param slot - The slot to check
   * @returns True if the cap has been reached, false otherwise.
   */
  hasReachedCheckpointProposalCap(slot: SlotNumber): Promise<boolean>;

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
