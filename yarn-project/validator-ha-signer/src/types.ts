import {
  BlockNumber,
  type CheckpointNumber,
  type IndexWithinCheckpoint,
  type SlotNumber,
} from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { DateProvider } from '@aztec/foundation/timer';
import type { TelemetryClient } from '@aztec/telemetry-client';

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
  if (
    context.dutyType === DutyType.BLOCK_PROPOSAL ||
    context.dutyType === DutyType.CHECKPOINT_PROPOSAL ||
    context.dutyType === DutyType.ATTESTATION ||
    context.dutyType === DutyType.ATTESTATIONS_AND_SIGNERS
  ) {
    return context.blockNumber;
  }
  return BlockNumber(0);
}

/**
 * Context required for slashing protection during signing operations.
 */
export type SigningContext = HAProtectedSigningContext | NoHAProtectionSigningContext;

/**
 * Database interface for slashing protection operations
 */
export interface SlashingProtectionDatabase {
  tryInsertOrGetExisting(params: CheckAndRecordParams): Promise<TryInsertOrGetResult>;
  updateDutySigned(
    rollupAddress: EthAddress,
    validatorAddress: EthAddress,
    slot: SlotNumber,
    dutyType: DutyType,
    signature: string,
    lockToken: string,
    blockIndexWithinCheckpoint: number,
  ): Promise<boolean>;
  deleteDuty(
    rollupAddress: EthAddress,
    validatorAddress: EthAddress,
    slot: SlotNumber,
    dutyType: DutyType,
    lockToken: string,
    blockIndexWithinCheckpoint: number,
  ): Promise<boolean>;
  cleanupOwnStuckDuties(nodeId: string, maxAgeMs: number): Promise<number>;
  cleanupOutdatedRollupDuties(currentRollupAddress: EthAddress): Promise<number>;
  cleanupOldDuties(maxAgeMs: number): Promise<number>;
  close(): Promise<void>;
}
