import { EthAddress } from '@aztec/foundation/eth-address';

import { z } from 'zod';

import { schemas, zodFor } from '../schemas/index.js';

export enum OffenseType {
  UNKNOWN = 0,
  /** The data for the txs in a published checkpoint was not available within the tolerance window, we slash the checkpoint's attesters */
  DATA_WITHHOLDING = 1,
  /** A proposer failed to attest or propose during an epoch according to the Sentinel */
  INACTIVITY = 3,
  /** A proposer sent an invalid block proposal over the p2p network to the committee */
  BROADCASTED_INVALID_BLOCK_PROPOSAL = 4,
  /** A proposer pushed to L1 a block with insufficient committee attestations */
  PROPOSED_INSUFFICIENT_ATTESTATIONS = 5,
  /** A proposer pushed to L1 a block with incorrect committee attestations (ie signature from a non-committee member) */
  PROPOSED_INCORRECT_ATTESTATIONS = 6,
  /** A proposer published a checkpoint to L1 that builds on an invalid checkpoint (as in a checkpoint with invalid or insufficient attestations) */
  PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS = 7,
  /** A proposer sent duplicate proposals for the same position (slot, indexWithinCheckpoint for blocks or slot for checkpoints) */
  DUPLICATE_PROPOSAL = 8,
  /** A validator signed attestations for different proposals at the same slot (equivocation) */
  DUPLICATE_ATTESTATION = 9,
  /** A committee member attested to a checkpoint proposal in a slot with an invalid block proposal */
  ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL = 10,
  /** A proposer broadcast an invalid checkpoint proposal, detected by retained evidence or deterministic recomputation */
  BROADCASTED_INVALID_CHECKPOINT_PROPOSAL = 11,
}

export function getOffenseTypeName(offense: OffenseType) {
  switch (offense) {
    case OffenseType.UNKNOWN:
      return 'unknown';
    case OffenseType.DATA_WITHHOLDING:
      return 'data_withholding';
    case OffenseType.INACTIVITY:
      return 'inactivity';
    case OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL:
      return 'broadcasted_invalid_block_proposal';
    case OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS:
      return 'proposed_insufficient_attestations';
    case OffenseType.PROPOSED_INCORRECT_ATTESTATIONS:
      return 'proposed_incorrect_attestations';
    case OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS:
      return 'proposed_descendant_of_checkpoint_with_invalid_attestations';
    case OffenseType.DUPLICATE_PROPOSAL:
      return 'duplicate_proposal';
    case OffenseType.DUPLICATE_ATTESTATION:
      return 'duplicate_attestation';
    case OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL:
      return 'attested_to_invalid_checkpoint_proposal';
    case OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL:
      return 'broadcasted_invalid_checkpoint_proposal';
    default:
      throw new Error(`Unknown offense type: ${offense}`);
  }
}

export const OffenseTypeSchema = z.nativeEnum(OffenseType);

export const OffenseToBigInt: Record<OffenseType, bigint> = {
  [OffenseType.UNKNOWN]: 0n,
  [OffenseType.DATA_WITHHOLDING]: 1n,
  [OffenseType.INACTIVITY]: 3n,
  [OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL]: 4n,
  [OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS]: 5n,
  [OffenseType.PROPOSED_INCORRECT_ATTESTATIONS]: 6n,
  [OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS]: 7n,
  [OffenseType.DUPLICATE_PROPOSAL]: 8n,
  [OffenseType.DUPLICATE_ATTESTATION]: 9n,
  [OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL]: 10n,
  [OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL]: 11n,
};

export function bigIntToOffense(offense: bigint): OffenseType {
  switch (offense) {
    case 0n:
      return OffenseType.UNKNOWN;
    case 1n:
      return OffenseType.DATA_WITHHOLDING;
    case 3n:
      return OffenseType.INACTIVITY;
    case 4n:
      return OffenseType.BROADCASTED_INVALID_BLOCK_PROPOSAL;
    case 5n:
      return OffenseType.PROPOSED_INSUFFICIENT_ATTESTATIONS;
    case 6n:
      return OffenseType.PROPOSED_INCORRECT_ATTESTATIONS;
    case 7n:
      return OffenseType.PROPOSED_DESCENDANT_OF_CHECKPOINT_WITH_INVALID_ATTESTATIONS;
    case 8n:
      return OffenseType.DUPLICATE_PROPOSAL;
    case 9n:
      return OffenseType.DUPLICATE_ATTESTATION;
    case 10n:
      return OffenseType.ATTESTED_TO_INVALID_CHECKPOINT_PROPOSAL;
    case 11n:
      return OffenseType.BROADCASTED_INVALID_CHECKPOINT_PROPOSAL;
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

export const OffenseSchema = zodFor<Offense>()(
  z.object({
    validator: schemas.EthAddress,
    amount: schemas.BigInt,
    offenseType: OffenseTypeSchema,
    epochOrSlot: schemas.BigInt,
  }),
);

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

/** Votes for a validator slash in the slashing proposer */
export type ValidatorSlashVote = number;

export type ProposerSlashAction =
  /** Vote for offenses on the slashing proposer */
  | { type: 'vote-offenses'; votes: ValidatorSlashVote[]; committees: EthAddress[][]; round: bigint }
  /** Execute a slashing round on the slashing proposer */
  | { type: 'execute-slash'; committees: EthAddress[][]; round: bigint };

export type ProposerSlashActionType = ProposerSlashAction['type'];
