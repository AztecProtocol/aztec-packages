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

export function getOffenseTypeName(offense: OffenseType) {
  switch (offense) {
    case OffenseType.UNKNOWN:
      return 'unknown';
    case OffenseType.DATA_WITHHOLDING:
      return 'data_withholding';
    case OffenseType.VALID_EPOCH_PRUNED:
      return 'valid_epoch_pruned';
    case OffenseType.INACTIVITY:
      return 'inactivity';
    case OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL:
      return 'broadcasted_invalid_block_proposal';
    case OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS:
      return 'proposed_insufficient_attestations';
    case OffenseType.PROPOSED_INCORRECT_ATTESTATIONS:
      return 'proposed_incorrect_attestations';
    case OffenseType.ATTESTED_DESCENDANT_OF_INVALID:
      return 'attested_descendant_of_invalid';
    default:
      throw new Error(`Unknown offense type: ${offense}`);
  }
}

export const OffenseTypeSchema = z.nativeEnum(OffenseType);

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

/** Offense by a validator in the context of a slash payload */
export type ValidatorSlashOffense = {
  epochOrSlot: bigint;
  offenseType: OffenseType;
};

/** Slashed amount and total offenses by a validator in the context of a slash payload */
export type ValidatorSlash = {
  validator: EthAddress;
  amount: bigint;
  offenses: ValidatorSlashOffense[];
};

/** Slash payload as published by the empire slash proposer */
export type SlashPayload = {
  address: EthAddress;
  slashes: ValidatorSlash[];
  timestamp: bigint;
};

/** Slash payload with round information from empire slash proposer */
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

/** Votes for a validator slash in the consensus slash proposer */
export type ValidatorSlashVote = number;

export type ProposerSlashAction =
  /** Create a new slash payload on an empire-based slash proposer */
  | { type: 'create-empire-payload'; data: ValidatorSlash[] }
  /** Vote for a slashing payload on an empire-based slash proposer */
  | { type: 'vote-empire-payload'; payload: EthAddress }
  /** Execute a slashing payload on an empire-based slash proposer */
  | { type: 'execute-empire-payload'; round: bigint }
  /** Vote for offenses on a consensus slashing proposer */
  | { type: 'vote-offenses'; votes: ValidatorSlashVote[]; committees: EthAddress[][]; round: bigint }
  /** Execute a slashing round on a consensus slashing proposer */
  | { type: 'execute-slash'; committees: EthAddress[][]; round: bigint };

export type ProposerSlashActionType = ProposerSlashAction['type'];
