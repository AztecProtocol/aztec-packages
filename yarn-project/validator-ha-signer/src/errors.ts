/**
 * Custom errors for the validator HA signer
 */
import type { SlotNumber } from '@aztec/foundation/branded-types';

import type { DutyType } from './db/types.js';

/**
 * Thrown when a duty has already been signed (by any node).
 * This is expected behavior in an HA setup - all nodes try to sign,
 * the first one wins, and subsequent attempts get this error.
 */
export class DutyAlreadySignedError extends Error {
  constructor(
    public readonly slot: SlotNumber,
    public readonly dutyType: DutyType,
    public readonly blockIndexWithinCheckpoint: number,
    public readonly signedByNode: string,
  ) {
    super(`Duty ${dutyType} for slot ${slot} already signed by node ${signedByNode}`);
    this.name = 'DutyAlreadySignedError';
  }
}

/**
 * Thrown when attempting to sign data that conflicts with an already-signed duty.
 * This means the same validator tried to sign DIFFERENT data for the same slot.
 *
 * This is expected in HA setups where nodes may build different blocks
 * (e.g., different transaction ordering) - the protection prevents double-signing.
 */
export class SlashingProtectionError extends Error {
  constructor(
    public readonly slot: SlotNumber,
    public readonly dutyType: DutyType,
    public readonly blockIndexWithinCheckpoint: number,
    public readonly existingMessageHash: string,
    public readonly attemptedMessageHash: string,
    public readonly signedByNode: string,
  ) {
    super(
      `Slashing protection: ${dutyType} for slot ${slot} was already signed with different data. ` +
        `Existing: ${existingMessageHash.slice(0, 10)}..., Attempted: ${attemptedMessageHash.slice(0, 10)}...`,
    );
    this.name = 'SlashingProtectionError';
  }
}
