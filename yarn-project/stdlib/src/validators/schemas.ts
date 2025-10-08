import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

import type {
  SingleValidatorStats,
  ValidatorMissedStats,
  ValidatorStats,
  ValidatorStatusHistory,
  ValidatorStatusInSlot,
  ValidatorsStats,
} from './types.js';

export const ValidatorStatusInSlotSchema = z.enum([
  'block-mined',
  'block-proposed',
  'block-missed',
  'attestation-sent',
  'attestation-missed',
]) satisfies ZodFor<ValidatorStatusInSlot>;

export const ValidatorStatusHistorySchema = z.array(
  z.object({
    slot: schemas.BigInt,
    status: ValidatorStatusInSlotSchema,
  }),
) satisfies ZodFor<ValidatorStatusHistory>;

export const ValidatorStatusHistorySchemaArray = z.array(ValidatorStatusHistorySchema);

export const ValidatorStatusHistorySchemaMap = z.record(ValidatorStatusHistorySchemaArray);

const ValidatorTimeStatSchema = z.object({
  timestamp: schemas.BigInt,
  slot: schemas.BigInt,
  date: z.string(),
});

const ValidatorMissedStatsSchema = z.object({
  currentStreak: schemas.Integer,
  rate: z.number().optional(),
  count: schemas.Integer,
  total: schemas.Integer,
}) satisfies ZodFor<ValidatorMissedStats>;

export const ValidatorStatsSchema = z.object({
  address: schemas.EthAddress,
  lastProposal: ValidatorTimeStatSchema.optional(),
  lastAttestation: ValidatorTimeStatSchema.optional(),
  totalSlots: schemas.Integer,
  missedProposals: ValidatorMissedStatsSchema,
  missedAttestations: ValidatorMissedStatsSchema,
  history: ValidatorStatusHistorySchema,
}) satisfies ZodFor<ValidatorStats>;

export const ValidatorsStatsSchema = z.object({
  stats: z.record(ValidatorStatsSchema),
  lastProcessedSlot: schemas.BigInt.optional(),
  initialSlot: schemas.BigInt.optional(),
  slotWindow: schemas.Integer,
}) satisfies ZodFor<ValidatorsStats>;

export const SingleValidatorStatsSchema = z.object({
  validator: ValidatorStatsSchema,
  allTimeProvenPerformance: z.array(
    z.object({
      missed: schemas.Integer,
      total: schemas.Integer,
      epoch: schemas.BigInt,
    }),
  ),
  lastProcessedSlot: schemas.BigInt.optional(),
  initialSlot: schemas.BigInt.optional(),
  slotWindow: schemas.Integer,
}) satisfies ZodFor<SingleValidatorStats>;
