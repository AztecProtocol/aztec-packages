import type { EthAddress } from '@aztec/foundation/eth-address';

import { z } from 'zod';

import { type ZodFor, schemas } from '../schemas/index.js';

export enum OffenseType {
  UNKNOWN = 0,
  DATA_WITHHOLDING = 1,
  VALID_EPOCH_PRUNED = 2,
  INACTIVITY = 3,
  /** A proposer sent an invalid block proposal over the p2p network to the committee */
  BROADCASTED_INVALID_BLOCK_PROPOSAL = 4,
  /** A proposer pushed to L1 a block with insufficient committee attestations */
  PROPOSED_INSUFFICIENT_ATTESTATIONS = 5,
  /** A proposer pushed to L1 a block with incorrect committee attestations (ie signature from a non-committee member) */
  PROPOSED_INCORRECT_ATTESTATIONS = 6,
  /** A committee member attested to a block that was built as a descendent of an invalid block (as in a block with invalid attestations) */
  ATTESTED_DESCENDANT_OF_INVALID = 7,
}

export const OffenseTypeSchema = z.nativeEnum(OffenseType);

export type ValidatorSlashOffense = {
  epochOrSlot: bigint;
  offenseType: OffenseType;
};

export type ValidatorSlash = {
  validator: EthAddress;
  amount: bigint;
  offenses: ValidatorSlashOffense[];
};

export type SlashPayload = {
  address: EthAddress;
  slashes: ValidatorSlash[];
  timestamp: bigint;
};

export type SlashPayloadRound = SlashPayload & { votes: bigint; round: bigint };

export type MonitoredSlashPayload = {
  payloadAddress: EthAddress;
  validators: readonly EthAddress[];
  amounts: readonly bigint[];
  offenses: readonly OffenseType[];
  observedAtSeconds: number;
  totalAmount: bigint;
  votes: number;
};

export const MonitoredSlashPayloadSchema = z.object({
  payloadAddress: schemas.EthAddress,
  validators: z.array(schemas.EthAddress),
  amounts: z.array(schemas.BigInt),
  offenses: z.array(OffenseTypeSchema),
  observedAtSeconds: z.number(),
  totalAmount: schemas.BigInt,
  votes: z.number(),
}) satisfies ZodFor<MonitoredSlashPayload>;

export const OffenseToBigInt: Record<OffenseType, bigint> = {
  [OffenseType.UNKNOWN]: 0n,
  [OffenseType.DATA_WITHHOLDING]: 1n,
  [OffenseType.VALID_EPOCH_PRUNED]: 2n,
  [OffenseType.INACTIVITY]: 3n,
  [OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL]: 4n,
  [OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS]: 5n,
  [OffenseType.PROPOSED_INCORRECT_ATTESTATIONS]: 6n,
  [OffenseType.ATTESTED_DESCENDANT_OF_INVALID]: 7n,
};

export function bigIntToOffense(offense: bigint): OffenseType {
  switch (offense) {
    case 0n:
      return OffenseType.UNKNOWN;
    case 1n:
      return OffenseType.DATA_WITHHOLDING;
    case 2n:
      return OffenseType.VALID_EPOCH_PRUNED;
    case 3n:
      return OffenseType.INACTIVITY;
    case 4n:
      return OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL;
    case 5n:
      return OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS;
    case 6n:
      return OffenseType.PROPOSED_INCORRECT_ATTESTATIONS;
    case 7n:
      return OffenseType.ATTESTED_DESCENDANT_OF_INVALID;
    default:
      throw new Error(`Unknown offense: ${offense}`);
  }
}

/**
 * Returns true if the offense is uncontroversial as in it can be verified via L1 data alone,
 * and does not depend on the local view of the node of the L2 p2p network.
 * @param offense - The offense type to check
 */
export function isOffenseUncontroversial(offense: OffenseType): boolean {
  return (
    offense === OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS ||
    offense === OffenseType.PROPOSED_INCORRECT_ATTESTATIONS ||
    offense === OffenseType.ATTESTED_DESCENDANT_OF_INVALID
  );
}

export type Offense = {
  validator: EthAddress;
  amount: bigint;
  offense: OffenseType;
  epochOrSlot: bigint;
};

export type OffenseIdentifier = {
  validator: EthAddress;
  offense: OffenseType;
  epochOrSlot: bigint;
};

export function getOffenseIdentifiersFromPayload(payload: SlashPayload | SlashPayloadRound): OffenseIdentifier[] {
  return payload.slashes.flatMap((slash: ValidatorSlash) =>
    slash.offenses.map(o => ({
      validator: slash.validator,
      offense: o.offenseType,
      epochOrSlot: o.epochOrSlot,
    })),
  );
}

export function offensesToValidatorSlash(offenses: Offense[]): ValidatorSlash[] {
  return offenses.map(offense => ({
    validator: offense.validator,
    amount: offense.amount,
    offenses: [{ epochOrSlot: offense.epochOrSlot, offenseType: offense.offense }],
  }));
}

/**
 * Sorts offense data by:
 * - Uncontroversial offenses first
 * - Slash amount (descending)
 * - Epoch or slot (ascending, ie oldest first)
 * - Validator address (ascending)
 * - Offense type (descending)
 */
export function offenseDataComparator(a: Offense, b: Offense): number {
  return (
    Number(isOffenseUncontroversial(b.offense)) - Number(isOffenseUncontroversial(a.offense)) ||
    Number(b.amount - a.amount) ||
    Number(a.epochOrSlot - b.epochOrSlot) ||
    a.validator.toString().localeCompare(b.validator.toString()) ||
    Number(b.offense) - Number(a.offense)
  );
}

export type ProposerSlashAction =
  | { type: 'create-payload'; data: ValidatorSlash[] }
  | { type: 'vote-payload'; payload: EthAddress }
  | { type: 'execute-payload'; round: bigint };

export type ProposerSlashActionType = ProposerSlashAction['type'];
