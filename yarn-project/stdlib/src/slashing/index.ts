import type { EthAddress } from '@aztec/foundation/eth-address';

import { z } from 'zod';

import { type ZodFor, schemas } from '../schemas/index.js';

export enum Offense {
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

export const OffenseSchema = z.nativeEnum(Offense);

export type MonitoredSlashPayload = {
  payloadAddress: EthAddress;
  validators: readonly EthAddress[];
  amounts: readonly bigint[];
  offenses: readonly Offense[];
  observedAtSeconds: number;
  totalAmount: bigint;
};

export const MonitoredSlashPayloadSchema = z.object({
  payloadAddress: schemas.EthAddress,
  validators: z.array(schemas.EthAddress),
  amounts: z.array(schemas.BigInt),
  offenses: z.array(OffenseSchema),
  observedAtSeconds: z.number(),
  totalAmount: schemas.BigInt,
}) satisfies ZodFor<MonitoredSlashPayload>;

export const OffenseToBigInt: Record<Offense, bigint> = {
  [Offense.UNKNOWN]: 0n,
  [Offense.DATA_WITHHOLDING]: 1n,
  [Offense.VALID_EPOCH_PRUNED]: 2n,
  [Offense.INACTIVITY]: 3n,
  [Offense.BROADCASTED_INVALID_BLOCK_PROPOSAL]: 4n,
  [Offense.PROPOSED_INSUFFICIENT_ATTESTATIONS]: 5n,
  [Offense.PROPOSED_INCORRECT_ATTESTATIONS]: 6n,
  [Offense.ATTESTED_DESCENDANT_OF_INVALID]: 7n,
};

export function bigIntToOffense(offense: bigint): Offense {
  switch (offense) {
    case 0n:
      return Offense.UNKNOWN;
    case 1n:
      return Offense.DATA_WITHHOLDING;
    case 2n:
      return Offense.VALID_EPOCH_PRUNED;
    case 3n:
      return Offense.INACTIVITY;
    case 4n:
      return Offense.BROADCASTED_INVALID_BLOCK_PROPOSAL;
    case 5n:
      return Offense.PROPOSED_INSUFFICIENT_ATTESTATIONS;
    case 6n:
      return Offense.PROPOSED_INCORRECT_ATTESTATIONS;
    case 7n:
      return Offense.ATTESTED_DESCENDANT_OF_INVALID;
    default:
      throw new Error(`Unknown offense: ${offense}`);
  }
}
