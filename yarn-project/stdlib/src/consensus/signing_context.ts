import {
  BlockNumber,
  CheckpointNumber,
  type IndexWithinCheckpoint,
  type SlotNumber,
} from '@aztec/foundation/branded-types';

/**
 * Type of validator duty being performed
 */
export enum DutyType {
  BLOCK_PROPOSAL = 'BLOCK_PROPOSAL',
  CHECKPOINT_PROPOSAL = 'CHECKPOINT_PROPOSAL',
  ATTESTATION = 'ATTESTATION',
  ATTESTATIONS_AND_SIGNERS = 'ATTESTATIONS_AND_SIGNERS',
  GOVERNANCE_VOTE = 'GOVERNANCE_VOTE',
  SLASHING_VOTE = 'SLASHING_VOTE',
  AUTH_REQUEST = 'AUTH_REQUEST',
  TXS = 'TXS',
}

/**
 * Signing context for block proposals.
 * Includes both the block number and the checkpoint number the block belongs to.
 */
export interface BlockProposalSigningContext {
  slot: SlotNumber;
  blockNumber: BlockNumber;
  checkpointNumber: CheckpointNumber;
  /** Block index within checkpoint (0, 1, 2...). Required for block proposals. */
  blockIndexWithinCheckpoint: IndexWithinCheckpoint;
  dutyType: DutyType.BLOCK_PROPOSAL;
}

/**
 * Signing context for checkpoint proposals.
 * Includes the checkpoint number being proposed, but not a block number.
 */
export interface CheckpointProposalSigningContext {
  slot: SlotNumber;
  checkpointNumber: CheckpointNumber;
  dutyType: DutyType.CHECKPOINT_PROPOSAL;
}

/**
 * Signing context for attestation duties (checkpoint attestations).
 * Includes the checkpoint number when available (from proposal validation).
 */
export interface AttestationSigningContext {
  slot: SlotNumber;
  checkpointNumber: CheckpointNumber;
  dutyType: DutyType.ATTESTATION | DutyType.ATTESTATIONS_AND_SIGNERS;
}

/**
 * Signing context for governance/slashing votes which only need slot for HA protection.
 */
export interface VoteSigningContext {
  slot: SlotNumber;
  dutyType: DutyType.GOVERNANCE_VOTE | DutyType.SLASHING_VOTE;
}

/**
 * Signing context for duties which don't require slot/blockNumber
 * as they don't need HA protection (AUTH_REQUEST, TXS).
 */
export interface NoHAProtectionSigningContext {
  dutyType: DutyType.AUTH_REQUEST | DutyType.TXS;
}

/**
 * Signing contexts that require HA protection (excludes AUTH_REQUEST and TXS).
 * Used by the HA signer's signWithProtection method.
 */
export type HAProtectedSigningContext =
  | BlockProposalSigningContext
  | CheckpointProposalSigningContext
  | AttestationSigningContext
  | VoteSigningContext;

/**
 * Context required for slashing protection during signing operations.
 * Uses discriminated union to enforce type safety:
 * - BLOCK_PROPOSAL duties have blockNumber, checkpointNumber, and blockIndexWithinCheckpoint
 * - CHECKPOINT_PROPOSAL duties have checkpointNumber
 * - ATTESTATION/ATTESTATIONS_AND_SIGNERS duties have only slot
 * - Vote duties have only slot
 * - AUTH_REQUEST and TXS duties don't need HA protection
 */
export type SigningContext = HAProtectedSigningContext | NoHAProtectionSigningContext;

/**
 * Type guard to check if a SigningContext requires HA protection.
 * Returns true for contexts that need HA protection, false for AUTH_REQUEST and TXS.
 */
export function isHAProtectedContext(context: SigningContext): context is HAProtectedSigningContext {
  return context.dutyType !== DutyType.AUTH_REQUEST && context.dutyType !== DutyType.TXS;
}

/**
 * Gets the block number from a signing context.
 * Only BLOCK_PROPOSAL duties carry a block number; all others return BlockNumber(0).
 */
export function getBlockNumberFromSigningContext(context: HAProtectedSigningContext): BlockNumber {
  if (context.dutyType === DutyType.BLOCK_PROPOSAL) {
    return context.blockNumber;
  }
  return BlockNumber(0);
}

/**
 * Gets the checkpoint number from a signing context.
 * BLOCK_PROPOSAL, CHECKPOINT_PROPOSAL, ATTESTATION, and ATTESTATIONS_AND_SIGNERS duties carry a checkpoint number;
 * vote duties return CheckpointNumber(0).
 */
export function getCheckpointNumberFromSigningContext(context: HAProtectedSigningContext): CheckpointNumber {
  if (
    context.dutyType === DutyType.BLOCK_PROPOSAL ||
    context.dutyType === DutyType.CHECKPOINT_PROPOSAL ||
    context.dutyType === DutyType.ATTESTATION ||
    context.dutyType === DutyType.ATTESTATIONS_AND_SIGNERS
  ) {
    return context.checkpointNumber;
  }
  return CheckpointNumber(0);
}
