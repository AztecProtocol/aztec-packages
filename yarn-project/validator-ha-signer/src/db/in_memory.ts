/**
 * In-memory implementation of SlashingProtectionDatabase for testing.
 * Used to simulate shared slashing protection in HA test setups without requiring PostgreSQL.
 */
import type { BlockNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { EthAddress } from '@aztec/foundation/eth-address';

import type { SlashingProtectionDatabase, TryInsertOrGetResult, ValidatorDutyRecord } from '../types.js';
import type { CheckAndRecordParams, DutyType } from './types.js';
import { DutyStatus, getBlockIndexFromDutyIdentifier } from './types.js';

/** Creates a unique key for a duty based on its identifying fields. */
function dutyKey(
  rollupAddress: EthAddress,
  validatorAddress: EthAddress,
  slot: SlotNumber,
  dutyType: DutyType,
  blockIndexWithinCheckpoint: number,
): string {
  return `${rollupAddress}:${validatorAddress}:${slot}:${dutyType}:${blockIndexWithinCheckpoint}`;
}

/** In-memory slashing protection database for testing HA setups. */
export class InMemorySlashingProtectionDatabase implements SlashingProtectionDatabase {
  private duties = new Map<string, ValidatorDutyRecord>();

  tryInsertOrGetExisting(params: CheckAndRecordParams): Promise<TryInsertOrGetResult> {
    const blockIndex = getBlockIndexFromDutyIdentifier(params);
    const key = dutyKey(params.rollupAddress, params.validatorAddress, params.slot, params.dutyType, blockIndex);

    const existing = this.duties.get(key);
    if (existing) {
      return Promise.resolve({ isNew: false, record: existing });
    }

    const lockToken = `lock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const record: ValidatorDutyRecord = {
      rollupAddress: params.rollupAddress,
      validatorAddress: params.validatorAddress,
      slot: params.slot,
      blockNumber: params.blockNumber as BlockNumber,
      blockIndexWithinCheckpoint: blockIndex,
      dutyType: params.dutyType,
      status: DutyStatus.SIGNING,
      messageHash: params.messageHash,
      nodeId: params.nodeId,
      lockToken,
      startedAt: new Date(),
    };
    this.duties.set(key, record);
    return Promise.resolve({ isNew: true, record });
  }

  updateDutySigned(
    rollupAddress: EthAddress,
    validatorAddress: EthAddress,
    slot: SlotNumber,
    dutyType: DutyType,
    signature: string,
    lockToken: string,
    blockIndexWithinCheckpoint: number,
  ): Promise<boolean> {
    const key = dutyKey(rollupAddress, validatorAddress, slot, dutyType, blockIndexWithinCheckpoint);
    const record = this.duties.get(key);
    if (!record || record.lockToken !== lockToken) {
      return Promise.resolve(false);
    }
    record.status = DutyStatus.SIGNED;
    record.signature = signature;
    record.completedAt = new Date();
    return Promise.resolve(true);
  }

  deleteDuty(
    rollupAddress: EthAddress,
    validatorAddress: EthAddress,
    slot: SlotNumber,
    dutyType: DutyType,
    lockToken: string,
    blockIndexWithinCheckpoint: number,
  ): Promise<boolean> {
    const key = dutyKey(rollupAddress, validatorAddress, slot, dutyType, blockIndexWithinCheckpoint);
    const record = this.duties.get(key);
    if (!record || record.lockToken !== lockToken) {
      return Promise.resolve(false);
    }
    this.duties.delete(key);
    return Promise.resolve(true);
  }

  cleanupOwnStuckDuties(_nodeId: string, _maxAgeMs: number): Promise<number> {
    return Promise.resolve(0);
  }

  cleanupOutdatedRollupDuties(_currentRollupAddress: EthAddress): Promise<number> {
    return Promise.resolve(0);
  }

  cleanupOldDuties(_maxAgeMs: number): Promise<number> {
    return Promise.resolve(0);
  }

  close(): Promise<void> {
    this.duties.clear();
    return Promise.resolve();
  }
}
