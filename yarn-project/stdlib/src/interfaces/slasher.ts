import type { EthAddress } from '@aztec/foundation/eth-address';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

export type SlasherClientType = 'empire' | 'tally';

export interface SlasherConfig {
  slashOverridePayload?: EthAddress;
  slashPayloadTtlSeconds: number; // TTL for payloads, in seconds
  slashPruneEnabled: boolean;
  slashPrunePenalty: bigint;
  slashPruneMaxPenalty: bigint;
  slashBroadcastedInvalidBlockEnabled: boolean;
  slashBroadcastedInvalidBlockPenalty: bigint;
  slashBroadcastedInvalidBlockMaxPenalty: bigint;
  slashInactivityEnabled: boolean;
  slashInactivityCreateTargetPercentage: number; // 0-1, 0.9 means 90%. Must be greater than 0
  slashInactivitySignalTargetPercentage: number; // 0-1, 0.6 means 60%. Must be greater than 0
  slashInactivityCreatePenalty: bigint;
  slashInactivityMaxPenalty: bigint;
  slashProposerRoundPollingIntervalSeconds: number;
  slashProposeInvalidAttestationsPenalty: bigint;
  slashProposeInvalidAttestationsMaxPenalty: bigint;
  slashAttestDescendantOfInvalidPenalty: bigint;
  slashAttestDescendantOfInvalidMaxPenalty: bigint;
  slashUnknownPenalty: bigint;
  slashUnknownMaxPenalty: bigint;
  slashOffenseExpirationRounds: number; // Number of rounds after which pending offenses expire
  slashMaxPayloadSize: number; // Maximum number of offenses to include in a single slash payload
  slashGracePeriodL2Slots: number; // Number of L2 slots to wait after genesis before slashing for most offenses
}

export const SlasherConfigSchema = z.object({
  slashOverridePayload: schemas.EthAddress.optional(),
  slashPayloadTtlSeconds: z.number(),
  slashPruneEnabled: z.boolean(),
  slashPrunePenalty: schemas.BigInt,
  slashPruneMaxPenalty: schemas.BigInt,
  slashBroadcastedInvalidBlockEnabled: z.boolean(),
  slashBroadcastedInvalidBlockPenalty: schemas.BigInt,
  slashBroadcastedInvalidBlockMaxPenalty: schemas.BigInt,
  slashInactivityEnabled: z.boolean(),
  slashInactivityCreateTargetPercentage: z.number(),
  slashInactivitySignalTargetPercentage: z.number(),
  slashInactivityCreatePenalty: schemas.BigInt,
  slashInactivityMaxPenalty: schemas.BigInt,
  slashProposerRoundPollingIntervalSeconds: z.number(),
  slashProposeInvalidAttestationsPenalty: schemas.BigInt,
  slashProposeInvalidAttestationsMaxPenalty: schemas.BigInt,
  slashAttestDescendantOfInvalidPenalty: schemas.BigInt,
  slashAttestDescendantOfInvalidMaxPenalty: schemas.BigInt,
  slashUnknownPenalty: schemas.BigInt,
  slashUnknownMaxPenalty: schemas.BigInt,
  slashOffenseExpirationRounds: z.number(),
  slashMaxPayloadSize: z.number(),
  slashGracePeriodL2Slots: z.number(),
}) satisfies ZodFor<SlasherConfig>;
