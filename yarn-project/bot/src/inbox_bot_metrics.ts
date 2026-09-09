/**
 * Bounded attribute value sets for the inbox bot's OTel instruments.
 *
 * Every value that reaches a metric label must come from one of the unions below. None of them may carry a
 * hash, address, index, block or bucket number, batch id, exception text or timestamp: those belong in logs and
 * spans, where cardinality is not a cost. The attribute keys themselves live in `@aztec/telemetry-client`'s
 * `attributes.ts`, and the instrument definitions in its `metrics.ts`.
 */

/** L2 domain a message is consumed through. */
export const InboxBotModes = ['public', 'private'] as const;
export type InboxBotMode = (typeof InboxBotModes)[number];

/** Kind of batch a message belongs to. */
export const InboxBotScenarios = ['normal', 'saturation'] as const;
export type InboxBotScenario = (typeof InboxBotScenarios)[number];

/** Stage of the message lifecycle a duration sample covers. */
export const InboxBotStages = [
  'l1_submission_to_mined',
  'l1_mined_to_observed',
  'l1_mined_to_ready',
  'l1_mined_to_included',
  'l1_mined_to_completed',
] as const;
export type InboxBotStage = (typeof InboxBotStages)[number];

/** Milestone a message reached. */
export const InboxBotMilestones = [
  'sent',
  'observed',
  'ready',
  'included',
  'completed',
  'timed_out',
  'failed',
] as const;
export type InboxBotMilestone = (typeof InboxBotMilestones)[number];

/** Relation between the block that inserted a message and the block that consumed it. */
export const InboxBotBlockRelations = ['same_block', 'later_block', 'unknown'] as const;
export type InboxBotBlockRelation = (typeof InboxBotBlockRelations)[number];

/** Node API semantic check being recorded. */
export const InboxBotChecks = [
  'unknown_message',
  'event_integrity',
  'index_match',
  'readiness_witness',
  'consumption_nullifier',
  'replay_rejection',
  'bucket_rollover',
] as const;
export type InboxBotCheck = (typeof InboxBotChecks)[number];

/** Bounded reason a message or batch failed. */
export const InboxBotReasons = [
  'l1_submission',
  'l1_revert',
  'rpc',
  'simulation',
  'l2_drop',
  'l2_revert',
  'timeout',
  'api_inconsistency',
  'invalid_witness',
  'invalid_consumption',
  'replay_accepted',
  'bucket_mismatch',
  'reorg',
] as const;
export type InboxBotReason = (typeof InboxBotReasons)[number];

/** Chain tip a readiness check is anchored at. */
export const InboxBotAnchorPolicies = ['latest', 'proposed', 'checkpointed', 'proven', 'finalized'] as const;
export type InboxBotAnchorPolicy = (typeof InboxBotAnchorPolicies)[number];

/** Chain tip a message must reach to count as completed. */
export const InboxBotCompletionPolicies = ['proposed', 'checkpointed', 'proven'] as const;
export type InboxBotCompletionPolicy = (typeof InboxBotCompletionPolicies)[number];

/** Outcome of a consumption simulation. */
export const InboxBotSimulationResults = ['accepted', 'not_ready', 'error'] as const;
export type InboxBotSimulationResult = (typeof InboxBotSimulationResults)[number];

/** Outcome of a public consumption execution. */
export const InboxBotPublicExecutionResults = ['success', 'reverted'] as const;
export type InboxBotPublicExecutionResult = (typeof InboxBotPublicExecutionResults)[number];

/** Outcome of a node API semantic check. */
export const InboxBotCheckResults = ['passed', 'failed'] as const;
export type InboxBotCheckResult = (typeof InboxBotCheckResults)[number];

/** Outcome of an L1 batch submission. */
export const InboxBotL1BatchResults = ['success', 'reverted'] as const;
export type InboxBotL1BatchResult = (typeof InboxBotL1BatchResults)[number];

/** Outcome of a saturation run. */
export const InboxBotSaturationRunResults = ['started', 'success', 'failed'] as const;
export type InboxBotSaturationRunResult = (typeof InboxBotSaturationRunResults)[number];
