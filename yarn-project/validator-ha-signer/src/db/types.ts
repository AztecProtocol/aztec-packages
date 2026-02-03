import type { BlockNumber, CheckpointNumber, IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';

/**
 * Row type from PostgreSQL query
 */
export interface DutyRow {
  rollup_address: string;
  validator_address: string;
  slot: string;
  block_number: string;
  block_index_within_checkpoint: number;
  duty_type: DutyType;
  status: DutyStatus;
  message_hash: string;
  signature: string | null;
  node_id: string;
  lock_token: string;
  started_at: Date;
  completed_at: Date | null;
  error_message: string | null;
}

/**
 * Row type from INSERT_OR_GET_DUTY query (includes is_new flag)
 */
export interface InsertOrGetRow extends DutyRow {
  is_new: boolean;
}

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
 * Status of a duty in the database
 */
export enum DutyStatus {
  SIGNING = 'signing',
  SIGNED = 'signed',
}

/**
 * Record of a validator duty in the database
 */
export interface ValidatorDutyRecord {
  /** Ethereum address of the rollup contract */
  rollupAddress: EthAddress;
  /** Ethereum address of the validator */
  validatorAddress: EthAddress;
  /** Slot number for this duty */
  slot: SlotNumber;
  /** Block number for this duty */
  blockNumber: BlockNumber;
  /** Block index within checkpoint (0, 1, 2... for block proposals, -1 for other duty types) */
  blockIndexWithinCheckpoint: number;
  /** Type of duty being performed */
  dutyType: DutyType;
  /** Current status of the duty */
  status: DutyStatus;
  /** The signing root (hash) for this duty */
  messageHash: string;
  /** The signature (populated after successful signing) */
  signature?: string;
  /** Unique identifier for the node that acquired the lock */
  nodeId: string;
  /** Secret token for verifying ownership of the duty lock */
  lockToken: string;
  /** When the duty signing was started */
  startedAt: Date;
  /** When the duty signing was completed (success or failure) */
  completedAt?: Date;
  /** Error message (currently unused) */
  errorMessage?: string;
}

/**
 * Duty identifier for block proposals.
 * blockIndexWithinCheckpoint is REQUIRED and must be >= 0.
 */
export interface BlockProposalDutyIdentifier {
  rollupAddress: EthAddress;
  validatorAddress: EthAddress;
  slot: SlotNumber;
  /** Block index within checkpoint (0, 1, 2...). Required for block proposals. */
  blockIndexWithinCheckpoint: IndexWithinCheckpoint;
  dutyType: DutyType.BLOCK_PROPOSAL;
}

/**
 * Duty identifier for non-block-proposal duties.
 * blockIndexWithinCheckpoint is not applicable (internally stored as -1).
 */
export interface OtherDutyIdentifier {
  rollupAddress: EthAddress;
  validatorAddress: EthAddress;
  slot: SlotNumber;
  dutyType:
    | DutyType.CHECKPOINT_PROPOSAL
    | DutyType.ATTESTATION
    | DutyType.ATTESTATIONS_AND_SIGNERS
    | DutyType.GOVERNANCE_VOTE
    | DutyType.SLASHING_VOTE
    | DutyType.AUTH_REQUEST
    | DutyType.TXS;
}

/**
 * Minimal info needed to identify a unique duty.
 * Uses discriminated union to enforce type safety:
 * - BLOCK_PROPOSAL duties MUST have blockIndexWithinCheckpoint >= 0
 * - Other duty types do NOT have blockIndexWithinCheckpoint (internally -1)
 */
export type DutyIdentifier = BlockProposalDutyIdentifier | OtherDutyIdentifier;

/**
 * Validates and normalizes the block index for a duty.
 * - BLOCK_PROPOSAL: validates blockIndexWithinCheckpoint is provided and >= 0
 * - Other duty types: always returns -1
 *
 * @throws Error if BLOCK_PROPOSAL is missing blockIndexWithinCheckpoint or has invalid value
 */
export function normalizeBlockIndex(dutyType: DutyType, blockIndexWithinCheckpoint: number | undefined): number {
  if (dutyType === DutyType.BLOCK_PROPOSAL) {
    if (blockIndexWithinCheckpoint === undefined) {
      throw new Error('BLOCK_PROPOSAL duties require blockIndexWithinCheckpoint to be specified');
    }
    if (blockIndexWithinCheckpoint < 0) {
      throw new Error(
        `BLOCK_PROPOSAL duties require blockIndexWithinCheckpoint >= 0, got ${blockIndexWithinCheckpoint}`,
      );
    }
    return blockIndexWithinCheckpoint;
  }
  // For all other duty types, always use -1
  return -1;
}

/**
 * Gets the block index from a DutyIdentifier.
 * - BLOCK_PROPOSAL: returns the blockIndexWithinCheckpoint
 * - Other duty types: returns -1
 */
export function getBlockIndexFromDutyIdentifier(duty: DutyIdentifier): number {
  if (duty.dutyType === DutyType.BLOCK_PROPOSAL) {
    return duty.blockIndexWithinCheckpoint;
  }
  return -1;
}

/**
 * Additional parameters for checking and recording a new duty
 */
interface CheckAndRecordExtra {
  /** Block number for this duty */
  blockNumber: BlockNumber | CheckpointNumber;
  /** The signing root (hash) for this duty */
  messageHash: string;
  /** Identifier for the node that acquired the lock */
  nodeId: string;
}

/**
 * Parameters for checking and recording a new duty.
 * Uses intersection with DutyIdentifier to preserve the discriminated union.
 */
export type CheckAndRecordParams = DutyIdentifier & CheckAndRecordExtra;

/**
 * Additional parameters for recording a successful signing
 */
interface RecordSuccessExtra {
  signature: Signature;
  nodeId: string;
  lockToken: string;
}

/**
 * Parameters for recording a successful signing.
 * Uses intersection with DutyIdentifier to preserve the discriminated union.
 */
export type RecordSuccessParams = DutyIdentifier & RecordSuccessExtra;

/**
 * Additional parameters for deleting a duty
 */
interface DeleteDutyExtra {
  lockToken: string;
}

/**
 * Parameters for deleting a duty.
 * Uses intersection with DutyIdentifier to preserve the discriminated union.
 */
export type DeleteDutyParams = DutyIdentifier & DeleteDutyExtra;
