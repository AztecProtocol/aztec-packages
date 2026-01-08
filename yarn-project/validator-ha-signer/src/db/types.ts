import type { EthAddress } from '@aztec/foundation/eth-address';
import type { Signature } from '@aztec/foundation/eth-signature';

/**
 * Row type from PostgreSQL query
 */
export interface DutyRow {
  validator_address: string;
  slot: string;
  block_number: string;
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
  ATTESTATION = 'ATTESTATION',
  ATTESTATIONS_AND_SIGNERS = 'ATTESTATIONS_AND_SIGNERS',
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
  /** Ethereum address of the validator */
  validatorAddress: EthAddress;
  /** Slot number for this duty */
  slot: bigint;
  /** Block number for this duty */
  blockNumber: bigint;
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
  /** Error message if status is 'failed' */
  errorMessage?: string;
}

/**
 * Minimal info needed to identify a unique duty
 */
export interface DutyIdentifier {
  validatorAddress: EthAddress;
  slot: bigint;
  dutyType: DutyType;
}

/**
 * Parameters for checking and recording a new duty
 */
export interface CheckAndRecordParams {
  validatorAddress: EthAddress;
  slot: bigint;
  blockNumber: bigint;
  dutyType: DutyType;
  messageHash: string;
  nodeId: string;
}

/**
 * Parameters for recording a successful signing
 */
export interface RecordSuccessParams {
  validatorAddress: EthAddress;
  slot: bigint;
  dutyType: DutyType;
  signature: Signature;
  nodeId: string;
  lockToken: string;
}

/**
 * Parameters for deleting a duty
 */
export interface DeleteDutyParams {
  validatorAddress: EthAddress;
  slot: bigint;
  dutyType: DutyType;
  lockToken: string;
}
