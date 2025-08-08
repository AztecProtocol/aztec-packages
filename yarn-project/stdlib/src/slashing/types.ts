import { EthAddress } from '@aztec/foundation/eth-address';

import { z } from 'zod';

import { type ZodFor, schemas } from '../schemas/index.js';

export enum OffenseType {
  UNKNOWN = 0,
  /** The data for proving an epoch was not publicly available, we slash its committee */
  DATA_WITHHOLDING = 1,
  /** An epoch was not successfully proven in time, we slash its committee */
  VALID_EPOCH_PRUNED = 2,
  /** A proposer failed to attest or propose during an epoch according to the Sentinel */
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

export const SlashPayloadRoundSchema = z.object({
  address: schemas.EthAddress,
  timestamp: schemas.BigInt,
  votes: schemas.BigInt,
  round: schemas.BigInt,
  slashes: z.array(
    z.object({
      validator: schemas.EthAddress,
      amount: schemas.BigInt,
      offenses: z.array(z.object({ offenseType: OffenseTypeSchema, epochOrSlot: schemas.BigInt })),
    }),
  ),
}) satisfies ZodFor<SlashPayloadRound>;

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

export type Offense = {
  validator: EthAddress;
  amount: bigint;
  offenseType: OffenseType;
  epochOrSlot: bigint;
};

export type OffenseIdentifier = Pick<Offense, 'validator' | 'offenseType' | 'epochOrSlot'>;

export const OffenseSchema = z.object({
  validator: schemas.EthAddress,
  amount: schemas.BigInt,
  offenseType: OffenseTypeSchema,
  epochOrSlot: schemas.BigInt,
}) satisfies ZodFor<Offense>;

export type ProposerSlashAction =
  | { type: 'create-payload'; data: ValidatorSlash[] }
  | { type: 'vote-payload'; payload: EthAddress }
  | { type: 'execute-payload'; round: bigint };

export type ProposerSlashActionType = ProposerSlashAction['type'];
