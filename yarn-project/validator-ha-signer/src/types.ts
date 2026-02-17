import {
  BlockNumber,
  type CheckpointNumber,
  type IndexWithinCheckpoint,
  type SlotNumber,
} from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';

import type { Pool } from 'pg';

import type { ValidatorHASignerConfig } from './config.js';
import {
  type BlockProposalDutyIdentifier,
  type CheckAndRecordParams,
  type DeleteDutyParams,
  type DutyIdentifier,
  type DutyRow,
  DutyType,
  type OtherDutyIdentifier,
  type RecordSuccessParams,
  type ValidatorDutyRecord,
} from './db/types.js';

export type {
  BlockProposalDutyIdentifier,
  CheckAndRecordParams,
  DeleteDutyParams,
  DutyIdentifier,
  DutyRow,
  OtherDutyIdentifier,
  RecordSuccessParams,
  ValidatorDutyRecord,
  ValidatorHASignerConfig,
};
export { DutyStatus, DutyType, getBlockIndexFromDutyIdentifier, normalizeBlockIndex } from './db/types.js';

/**
 * Result of tryInsertOrGetExisting operation
 */
export interface TryInsertOrGetResult {
  /** True if we inserted a new record, false if we got an existing record */
  isNew: boolean;
  /** The record (either newly inserted or existing) */
  record: ValidatorDutyRecord;
}

/**
 * deps for creating an HA signer
 */
export interface CreateHASignerDeps {
  /**
   * Optional PostgreSQL connection pool
   * If provided, databaseUrl and poolConfig are ignored
   */
  pool?: Pool;
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
 * Database interface for slashing protection operations
 * This abstraction allows for different database implementations (PostgreSQL, SQLite, etc.)
 *
 * The interface is designed around 3 core operations:
 * 1. tryInsertOrGetExisting - Atomically insert or get existing record (eliminates race conditions)
 * 2. updateDutySigned - Update to signed status on success
 * 3. deleteDuty - Delete a duty record on failure
 */
export interface SlashingProtectionDatabase {
  /**
   * Atomically try to insert a new duty record, or get the existing one if present.
   *
   * @returns { isNew: true, record } if we successfully inserted and acquired the lock
   * @returns { isNew: false, record } if a record already exists (caller should handle based on status)
   */
  tryInsertOrGetExisting(params: CheckAndRecordParams): Promise<TryInsertOrGetResult>;

  /**
   * Update a duty to 'signed' status with the signature.
   * Only succeeds if the lockToken matches (caller must be the one who created the duty).
   *
   * @returns true if the update succeeded, false if token didn't match or duty not found
   */
  updateDutySigned(
    rollupAddress: EthAddress,
    validatorAddress: EthAddress,
    slot: SlotNumber,
    dutyType: DutyType,
    signature: string,
    lockToken: string,
    blockIndexWithinCheckpoint: number,
  ): Promise<boolean>;

  /**
   * Delete a duty record.
   * Only succeeds if the lockToken matches (caller must be the one who created the duty).
   * Used when signing fails to allow another node/attempt to retry.
   *
   * @returns true if the delete succeeded, false if token didn't match or duty not found
   */
  deleteDuty(
    rollupAddress: EthAddress,
    validatorAddress: EthAddress,
    slot: SlotNumber,
    dutyType: DutyType,
    lockToken: string,
    blockIndexWithinCheckpoint: number,
  ): Promise<boolean>;

  /**
   * Cleanup own stuck duties
   * @returns the number of duties cleaned up
   */
  cleanupOwnStuckDuties(nodeId: string, maxAgeMs: number): Promise<number>;

  /**
   * Cleanup duties with outdated rollup address.
   * Removes all duties where the rollup address doesn't match the current one.
   * Used after a rollup upgrade to clean up duties for the old rollup.
   * @returns the number of duties cleaned up
   */
  cleanupOutdatedRollupDuties(currentRollupAddress: EthAddress): Promise<number>;

  /**
   * Cleanup old signed duties.
   * Removes only signed duties older than the specified age.
   * @returns the number of duties cleaned up
   */
  cleanupOldDuties(maxAgeMs: number): Promise<number>;

  /**
   * Close the database connection.
   * Should be called during graceful shutdown.
   */
  close(): Promise<void>;
}
