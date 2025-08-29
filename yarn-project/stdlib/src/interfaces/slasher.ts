import type { EthAddress } from '@aztec/foundation/eth-address';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

export type SlasherClientType = 'empire' | 'tally';

export interface SlasherConfig {
  slashOverridePayload?: EthAddress;
  slashPayloadTtlSeconds: number; // TTL for payloads, in seconds
  slashMinPenaltyPercentage: number;
  slashMaxPenaltyPercentage: number;
  slashValidatorsAlways: string; // Comma-separated list of validator addresses
  slashValidatorsNever: string; // Comma-separated list of validator addresses
  slashInactivityTargetPercentage: number; // 0-1, 0.9 means 90%. Must be greater than 0
  slashPrunePenalty: bigint;
  slashInactivityPenalty: bigint;
  slashBroadcastedInvalidBlockPenalty: bigint;
  slashProposeInvalidAttestationsPenalty: bigint;
  slashAttestDescendantOfInvalidPenalty: bigint;
  slashUnknownPenalty: bigint;
  slashOffenseExpirationRounds: number; // Number of rounds after which pending offenses expire
  slashMaxPayloadSize: number; // Maximum number of offenses to include in a single slash payload
  slashGracePeriodL2Slots: number; // Number of L2 slots to wait after genesis before slashing for most offenses
}

export const SlasherConfigSchema = z.object({
  slashOverridePayload: schemas.EthAddress.optional(),
  slashPayloadTtlSeconds: z.number(),
  slashMinPenaltyPercentage: z.number(),
  slashMaxPenaltyPercentage: z.number(),
  slashValidatorsAlways: z.string(),
  slashValidatorsNever: z.string(),
  slashPrunePenalty: schemas.BigInt,
  slashInactivityTargetPercentage: z.number(),
  slashInactivityPenalty: schemas.BigInt,
  slashProposeInvalidAttestationsPenalty: schemas.BigInt,
  slashAttestDescendantOfInvalidPenalty: schemas.BigInt,
  slashUnknownPenalty: schemas.BigInt,
  slashOffenseExpirationRounds: z.number(),
  slashMaxPayloadSize: z.number(),
  slashGracePeriodL2Slots: z.number(),
  slashBroadcastedInvalidBlockPenalty: schemas.BigInt,
}) satisfies ZodFor<SlasherConfig>;
