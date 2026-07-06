import { SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { DateProvider } from '@aztec/foundation/timer';
import {
  type AttestationSigningContext,
  type CheckpointProposalSigningContext,
  DutyType,
  type HAProtectedSigningContext,
  type SigningContext,
  getBlockNumberFromSigningContext as getBlockNumberFromSigningContextFromStdlib,
  getCheckpointNumberFromSigningContext as getCheckpointNumberFromSigningContextFromStdlib,
  isHAProtectedContext,
} from '@aztec/stdlib/consensus';
import type { ValidatorHASignerConfig } from '@aztec/stdlib/ha-signing';
import type { TelemetryClient } from '@aztec/telemetry-client';

import type { Pool } from 'pg';

import type {
  BlockProposalDutyIdentifier,
  CheckAndRecordParams,
  DeleteDutyParams,
  DutyIdentifier,
  DutyRow,
  OtherDutyIdentifier,
  RecordSuccessParams,
  ValidatorDutyRecord,
} from './db/types.js';

export type {
  AttestationSigningContext,
  BlockProposalDutyIdentifier,
  CheckAndRecordParams,
  CheckpointProposalSigningContext,
  DeleteDutyParams,
  DutyIdentifier,
  DutyRow,
  HAProtectedSigningContext,
  OtherDutyIdentifier,
  RecordSuccessParams,
  SigningContext,
  ValidatorDutyRecord,
  ValidatorHASignerConfig,
};
export { DutyStatus, DutyType, getBlockIndexFromDutyIdentifier, normalizeBlockIndex } from './db/types.js';
export { isHAProtectedContext };
export { getBlockNumberFromSigningContextFromStdlib as getBlockNumberFromSigningContext };
export { getCheckpointNumberFromSigningContextFromStdlib as getCheckpointNumberFromSigningContext };

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
  /**
   * Optional telemetry client for metrics
   */
  telemetryClient?: TelemetryClient;
  /**
   * Optional date provider for timestamps
   */
  dateProvider?: DateProvider;
}

/**
 * deps for creating a local signing protection signer
 */
export type CreateLocalSignerWithProtectionDeps = Omit<CreateHASignerDeps, 'pool'>;

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
