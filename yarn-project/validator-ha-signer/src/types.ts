import type { EthAddress } from '@aztec/foundation/eth-address';

import type { Pool } from 'pg';

import type { CreateHASignerConfig, SlashingProtectionConfig } from './config.js';
import type {
  CheckAndRecordParams,
  DeleteDutyParams,
  DutyIdentifier,
  DutyType,
  RecordSuccessParams,
  ValidatorDutyRecord,
} from './db/types.js';

export type {
  CheckAndRecordParams,
  CreateHASignerConfig,
  DeleteDutyParams,
  DutyIdentifier,
  RecordSuccessParams,
  SlashingProtectionConfig,
  ValidatorDutyRecord,
};
export { DutyStatus, DutyType } from './db/types.js';

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
 * Context required for slashing protection during signing operations
 */
export interface SigningContext {
  /** Slot number for this duty */
  slot: bigint;
  /** Block number for this duty */
  blockNumber: bigint;
  /** Type of duty being performed */
  dutyType: DutyType;
}

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
    validatorAddress: EthAddress,
    slot: bigint,
    dutyType: DutyType,
    signature: string,
    lockToken: string,
  ): Promise<boolean>;

  /**
   * Delete a duty record.
   * Only succeeds if the lockToken matches (caller must be the one who created the duty).
   * Used when signing fails to allow another node/attempt to retry.
   *
   * @returns true if the delete succeeded, false if token didn't match or duty not found
   */
  deleteDuty(validatorAddress: EthAddress, slot: bigint, dutyType: DutyType, lockToken: string): Promise<boolean>;

  /**
   * Cleanup own stuck duties
   * @returns the number of duties cleaned up
   */
  cleanupOwnStuckDuties(nodeId: string, maxAgeMs: number): Promise<number>;
}
