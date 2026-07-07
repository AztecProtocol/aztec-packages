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
 * Thrown when the slashing-protection record for an in-flight signing operation can no longer be
 * updated because it is no longer owned by this node - for example, the stuck-duty cleanup loop
 * deleted the SIGNING row while the remote signer was slow. The produced signature must be
 * discarded rather than broadcast: with no protection record in place, a later attempt for the
 * same duty with different data would sign freely, which is slashable equivocation.
 */
export class SigningLockLostError extends Error {
  constructor(
    public readonly slot: SlotNumber,
    public readonly dutyType: DutyType,
    public readonly nodeId: string,
  ) {
    super(
      `Slashing protection record for ${dutyType} at slot ${slot} was lost before signing completed ` +
        `(node ${nodeId}); discarding signature`,
    );
    this.name = 'SigningLockLostError';
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
