import type { EthAddress } from '@aztec/foundation/eth-address';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

export interface SlasherConfig {
  slashOverridePayload?: EthAddress;
  slashPayloadTtlSeconds: number; // TTL for payloads, in seconds
  slashPruneEnabled: boolean;
  slashPrunePenalty: bigint;
  slashPruneMaxPenalty: bigint;
  slashInvalidBlockEnabled: boolean;
  slashInvalidBlockPenalty: bigint;
  slashInvalidBlockMaxPenalty: bigint;
  slashInactivityEnabled: boolean;
  slashInactivityCreateTargetPercentage: number; // 0-1, 0.9 means 90%. Must be greater than 0
  slashInactivitySignalTargetPercentage: number; // 0-1, 0.6 means 60%. Must be greater than 0
  slashInactivityCreatePenalty: bigint;
  slashInactivityMaxPenalty: bigint;
  slashProposerRoundPollingIntervalSeconds: number;
}

export const SlasherConfigSchema = z.object({
  slashOverridePayload: schemas.EthAddress.optional(),
  slashPayloadTtlSeconds: z.number(),
  slashPruneEnabled: z.boolean(),
  slashPrunePenalty: schemas.BigInt,
  slashPruneMaxPenalty: schemas.BigInt,
  slashInvalidBlockEnabled: z.boolean(),
  slashInvalidBlockPenalty: schemas.BigInt,
  slashInvalidBlockMaxPenalty: schemas.BigInt,
  slashInactivityEnabled: z.boolean(),
  slashInactivityCreateTargetPercentage: z.number(),
  slashInactivitySignalTargetPercentage: z.number(),
  slashInactivityCreatePenalty: schemas.BigInt,
  slashInactivityMaxPenalty: schemas.BigInt,
  slashProposerRoundPollingIntervalSeconds: z.number(),
}) satisfies ZodFor<SlasherConfig>;
