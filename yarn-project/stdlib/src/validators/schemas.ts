import { schemas, zodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import type {
  SingleValidatorStats,
  ValidatorMissedStats,
  ValidatorStats,
  ValidatorStatusHistory,
  ValidatorStatusInSlot,
  ValidatorsStats,
} from './types.js';

export const ValidatorStatusInSlotSchema = zodFor<ValidatorStatusInSlot>()(
  z.enum([
    'checkpoint-mined',
    'checkpoint-proposed',
    'checkpoint-missed',
    'blocks-missed',
    'attestation-sent',
    'attestation-missed',
  ]),
);

export const ValidatorStatusHistorySchema = zodFor<ValidatorStatusHistory>()(
  z.array(
    z.object({
      slot: schemas.SlotNumber,
      status: ValidatorStatusInSlotSchema,
    }),
  ),
);

export const ValidatorStatusHistorySchemaArray = z.array(ValidatorStatusHistorySchema);

export const ValidatorStatusHistorySchemaMap = z.record(ValidatorStatusHistorySchemaArray);

const ValidatorTimeStatSchema = z.object({
  timestamp: schemas.BigInt,
  slot: schemas.SlotNumber,
  date: z.string(),
});

const ValidatorMissedStatsSchema = zodFor<ValidatorMissedStats>()(
  z.object({
    currentStreak: schemas.Integer,
    rate: z.number().optional(),
    count: schemas.Integer,
    total: schemas.Integer,
  }),
);

export const ValidatorStatsSchema = zodFor<ValidatorStats>()(
  z.object({
    address: schemas.EthAddress,
    lastProposal: ValidatorTimeStatSchema.optional(),
    lastAttestation: ValidatorTimeStatSchema.optional(),
    totalSlots: schemas.Integer,
    missedProposals: ValidatorMissedStatsSchema,
    missedAttestations: ValidatorMissedStatsSchema,
    history: ValidatorStatusHistorySchema,
  }),
);

export const ValidatorsStatsSchema = zodFor<ValidatorsStats>()(
  z.object({
    stats: z.record(ValidatorStatsSchema),
    lastProcessedSlot: schemas.SlotNumber.optional(),
    initialSlot: schemas.SlotNumber.optional(),
    slotWindow: schemas.Integer,
  }),
);

export const SingleValidatorStatsSchema = zodFor<SingleValidatorStats>()(
  z.object({
    validator: ValidatorStatsSchema,
    allTimeProvenPerformance: z.array(
      z.object({
        missed: schemas.Integer,
        total: schemas.Integer,
        epoch: schemas.EpochNumber,
      }),
    ),
    lastProcessedSlot: schemas.SlotNumber.optional(),
    initialSlot: schemas.SlotNumber.optional(),
    slotWindow: schemas.Integer,
  }),
);
