import { type EpochNumber, EpochNumberSchema } from '@aztec/foundation/branded-types';

import { z } from 'zod';

/** Opaque identifier for a work item that can be claimed. */
export type WorkItemId = string;

/** Opaque token proving ownership of a claim. */
export type ClaimToken = string;

/** A persisted claim on a work item. */
export type Claim = {
  workItemId: WorkItemId;
  nodeId: string;
  claimToken: ClaimToken;
  epochNumber: EpochNumber;
  claimedAt: number;
  lastActivity: number;
};

export const ClaimSchema = z.object({
  workItemId: z.string(),
  nodeId: z.string(),
  claimToken: z.string(),
  epochNumber: EpochNumberSchema,
  claimedAt: z.number(),
  lastActivity: z.number(),
});

export type ClaimStatus = { status: 'unclaimed' } | { status: 'active'; nodeId: string } | { status: 'expired' };

export const ClaimStatusSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('unclaimed') }),
  z.object({ status: z.literal('active'), nodeId: z.string() }),
  z.object({ status: z.literal('expired') }),
]);

/** Work item ID for a checkpoint sub-tree proving job. */
export function makeCheckpointSubTreeWorkItemId(epoch: EpochNumber, checkpointIndex: number): WorkItemId {
  return `checkpoint-sub-tree:${epoch}:${checkpointIndex}`;
}

/** Work item ID for a top-tree proving job. */
export function makeTopTreeWorkItemId(epoch: EpochNumber): WorkItemId {
  return `top-tree:${epoch}`;
}

/** Work item ID for a root rollup publishing job. */
export function makePublishWorkItemId(epoch: EpochNumber): WorkItemId {
  return `publish:${epoch}`;
}
