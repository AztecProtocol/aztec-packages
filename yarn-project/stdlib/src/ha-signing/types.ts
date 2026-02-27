import {
  BlockNumber,
  type CheckpointNumber,
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
 * Base context for signing operations
 */
interface BaseSigningContext {
  /** Slot number for this duty */
  slot: SlotNumber;
  /**
   * Block or checkpoint number for this duty.
   * For block proposals, this is the block number.
   * For checkpoint proposals, this is the checkpoint number.
   */
  blockNumber: BlockNumber | CheckpointNumber;
}

/**
 * Signing context for block proposals.
 * blockIndexWithinCheckpoint is REQUIRED and must be >= 0.
 */
export interface BlockProposalSigningContext extends BaseSigningContext {
  /** Block index within checkpoint (0, 1, 2...). Required for block proposals. */
  blockIndexWithinCheckpoint: IndexWithinCheckpoint;
  dutyType: DutyType.BLOCK_PROPOSAL;
}

/**
 * Signing context for non-block-proposal duties that require HA protection.
 * blockIndexWithinCheckpoint is not applicable (internally always -1).
 */
export interface OtherSigningContext extends BaseSigningContext {
  dutyType: DutyType.CHECKPOINT_PROPOSAL | DutyType.ATTESTATION | DutyType.ATTESTATIONS_AND_SIGNERS;
}

/**
 * Signing context for governance/slashing votes which only need slot for HA protection.
 * blockNumber is not applicable (internally always 0).
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
 * Signing contexts that require HA protection (excludes AUTH_REQUEST).
 * Used by the HA signer's signWithProtection method.
 */
export type HAProtectedSigningContext = BlockProposalSigningContext | OtherSigningContext | VoteSigningContext;

/**
 * Context required for slashing protection during signing operations.
 * Uses discriminated union to enforce type safety:
 * - BLOCK_PROPOSAL duties MUST have blockIndexWithinCheckpoint >= 0
 * - Other duty types do NOT have blockIndexWithinCheckpoint (internally -1)
 * - Vote duties only need slot (blockNumber is internally 0)
 * - AUTH_REQUEST and TXS duties don't need slot/blockNumber (no HA protection needed)
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
 * - Vote duties (GOVERNANCE_VOTE, SLASHING_VOTE): returns BlockNumber(0)
 * - Other duties: returns the blockNumber from the context
 */
export function getBlockNumberFromSigningContext(context: HAProtectedSigningContext): BlockNumber | CheckpointNumber {
  // Check for duty types that have blockNumber
  if (
    context.dutyType === DutyType.BLOCK_PROPOSAL ||
    context.dutyType === DutyType.CHECKPOINT_PROPOSAL ||
    context.dutyType === DutyType.ATTESTATION ||
    context.dutyType === DutyType.ATTESTATIONS_AND_SIGNERS
  ) {
    return context.blockNumber;
  }
  // Vote duties (GOVERNANCE_VOTE, SLASHING_VOTE) don't have blockNumber
  return BlockNumber(0);
}
