import { TopicType, createTopicString } from '@aztec/stdlib/p2p';
import type { ProposerTimetable } from '@aztec/stdlib/timetable';

import { createTopicScoreParams } from '@chainsafe/libp2p-gossipsub/score';

/**
 * Network parameters needed to compute topic-specific gossipsub scoring parameters.
 */
export type TopicScoringNetworkParams = {
  /** L2 slot duration in milliseconds */
  slotDurationMs: number;
  /** Gossipsub heartbeat interval in milliseconds */
  heartbeatIntervalMs: number;
  /** Target committee size (number of validators expected to attest per slot) */
  targetCommitteeSize: number;
  /**
   * Proposer timetable, shared with the gossip validators. Provides the max-blocks-per-checkpoint used to
   * derive expected per-slot message rates, so scoring stays consistent with block production.
   */
  timetable: ProposerTimetable;
  /** Expected number of block proposals per slot for scoring override. 0 disables scoring, undefined falls back to blocksPerSlot - 1. */
  expectedBlockProposalsPerSlot?: number;
};

/**
 * Determines the decay window in slots based on expected message frequency.
 * Low-frequency topics need longer decay windows to accumulate meaningful counter values.
 *
 * @param expectedMessagesPerSlot - Expected messages per slot for this topic
 * @returns Number of slots over which the counter should decay to ~1%
 */
export function getDecayWindowSlots(expectedMessagesPerSlot: number): number {
  if (expectedMessagesPerSlot <= 1) {
    return 5; // Low frequency: decay over 5 slots
  } else if (expectedMessagesPerSlot <= 10) {
    return 3; // Medium frequency: decay over 3 slots
  } else {
    return 2; // High frequency: decay over 2 slots
  }
}

/**
 * Computes the decay factor for exponential decay over a given window.
 * After `heartbeatsInWindow` heartbeats, the counter decays to ~1% of its original value.
 *
 * @param heartbeatIntervalMs - Gossipsub heartbeat interval in milliseconds
 * @param slotDurationMs - L2 slot duration in milliseconds
 * @param decayWindowSlots - Number of slots over which to decay
 * @returns Decay factor (0 < decay < 1), applied each heartbeat
 */
export function computeDecay(heartbeatIntervalMs: number, slotDurationMs: number, decayWindowSlots: number): number {
  const heartbeatsPerSlot = slotDurationMs / heartbeatIntervalMs;
  const heartbeatsInWindow = heartbeatsPerSlot * decayWindowSlots;

  // Decay to 1% over the window: decay^heartbeatsInWindow = 0.01
  // decay = 0.01^(1/heartbeatsInWindow)
  return Math.pow(0.01, 1 / heartbeatsInWindow);
}

/**
 * Computes the steady-state convergence value for a decaying counter.
 * If messages arrive at a constant rate and decay is applied each heartbeat,
 * the counter converges to: rate / (1 - decay)
 *
 * @param messagesPerHeartbeat - Expected messages per heartbeat
 * @param decay - Decay factor applied each heartbeat
 * @returns Convergence value (steady-state counter value)
 */
export function computeConvergence(messagesPerHeartbeat: number, decay: number): number {
  return messagesPerHeartbeat / (1 - decay);
}

/**
 * Computes a conservative threshold for mesh message deliveries.
 * The threshold should be low enough to avoid penalizing honest peers with normal variance.
 *
 * @param convergence - Steady-state counter value
 * @param conservativeFactor - Fraction of convergence to use as threshold (e.g., 0.3)
 * @returns Threshold value
 */
export function computeThreshold(convergence: number, conservativeFactor: number): number {
  return convergence * conservativeFactor;
}

/**
 * Determines the effective expected block proposals per slot for scoring.
 * Returns undefined if scoring should be disabled, or a positive number if enabled.
 *
 * @param blocksPerSlot - Number of blocks per slot from timetable
 * @param expectedBlockProposalsPerSlot - Config override. 0 disables scoring, undefined falls back to blocksPerSlot - 1.
 * @returns Positive number of expected block proposals, or undefined if scoring is disabled
 */
export function getEffectiveBlockProposalsPerSlot(
  blocksPerSlot: number,
  expectedBlockProposalsPerSlot?: number,
): number | undefined {
  if (expectedBlockProposalsPerSlot !== undefined) {
    return expectedBlockProposalsPerSlot > 0 ? expectedBlockProposalsPerSlot : undefined;
  }
  // Fallback: In MBPS mode, N-1 block proposals per slot (last one bundled with checkpoint)
  // In single block mode (blocksPerSlot=1), this is 0 → disabled
  const fallback = Math.max(0, blocksPerSlot - 1);
  return fallback > 0 ? fallback : undefined;
}

/**
 * Gets the expected messages per slot for a given topic type.
 *
 * @param topicType - The topic type
 * @param targetCommitteeSize - Target committee size
 * @param blocksPerSlot - Number of blocks per slot
 * @param expectedBlockProposalsPerSlot - Override for block proposals. 0 disables scoring, undefined falls back to blocksPerSlot - 1.
 * @returns Expected messages per slot, or undefined if unpredictable
 */
export function getExpectedMessagesPerSlot(
  topicType: TopicType,
  targetCommitteeSize: number,
  blocksPerSlot: number,
  expectedBlockProposalsPerSlot?: number,
): number | undefined {
  switch (topicType) {
    case TopicType.tx:
      // Transactions are unpredictable - disable mesh message delivery scoring
      return undefined;

    case TopicType.block_proposal:
      return getEffectiveBlockProposalsPerSlot(blocksPerSlot, expectedBlockProposalsPerSlot);

    case TopicType.checkpoint_proposal:
      // Exactly 1 checkpoint proposal per slot
      return 1;

    case TopicType.checkpoint_attestation:
      // Each committee member sends one attestation per slot
      return targetCommitteeSize;

    default:
      return undefined;
  }
}

/** Conservative factor for threshold calculation (30% of convergence) */
const CONSERVATIVE_FACTOR = 0.3;

/** Number of slots over which invalid message penalty decays */
const INVALID_DECAY_WINDOW_SLOTS = 4;

/** Weight for invalid message deliveries penalty */
const INVALID_MESSAGE_WEIGHT = -20;

/** Mesh message deliveries window in milliseconds (5 seconds - balanced for TypeScript runtime) */
const MESH_DELIVERIES_WINDOW_MS = 5000;

/**
 * Multiplier for activation time to provide extra grace period during network bootstrap.
 * The activation timer starts from mesh join time, not from first message received.
 * During bootstrap, peers may join before messages start flowing, so we need extra time.
 */
const ACTIVATION_MULTIPLIER = 5;

// ============================================================================
// P1 (timeInMesh) Configuration
// ============================================================================
// P1 rewards peers for time spent in the mesh. Following Lodestar's approach,
// we normalize the score so that max P1 = MAX_P1_SCORE after P1_CAP_TIME_SECONDS.
//
// Formula: P1 = min(timeInMesh / quantum, cap) * weight
// - quantum = slotDurationMs (one increment per slot worth of time)
// - cap = P1_CAP_TIME_SECONDS / slotSeconds (number of slots to reach cap)
// - weight = MAX_P1_SCORE / cap
//
// This ensures: max P1 = cap * weight = MAX_P1_SCORE

/** Maximum P1 score contribution per topic */
export const MAX_P1_SCORE = 8;

/** Time in seconds to reach P1 cap (1 hour) */
const P1_CAP_TIME_SECONDS = 3600;

// ============================================================================
// P2 (firstMessageDeliveries) Configuration
// ============================================================================
// P2 rewards peers who deliver messages first. We normalize so max P2 = MAX_P2_SCORE.
// P2 uses a decaying counter, so we set the cap based on convergence and scale the weight.
//
// Formula: P2 = min(firstMessageDeliveries, cap) * weight
// - cap = convergence value for first deliveries
// - weight = MAX_P2_SCORE / cap

/** Maximum P2 score contribution per topic */
export const MAX_P2_SCORE = 25;

/** Decay window for first message deliveries in slots (fast decay) */
const P2_DECAY_WINDOW_SLOTS = 2;

// ============================================================================
// P3 (meshMessageDeliveries) Configuration
// ============================================================================
// P3 penalizes peers who under-deliver messages. For a peer to be pruned from
// the mesh, their topic score must be negative: P1 + P2 + P3 < 0
//
// Therefore, P3 max penalty must exceed (P1 + P2) to cause pruning:
//   |P3| > P1 + P2
//   |P3| > 8 + 25 = 33
//
// We set P3 max = -34 per topic (slightly more than P1+P2) to ensure pruning.
// The number of P3-enabled topics depends on config: by default 2 (checkpoint_proposal +
// checkpoint_attestation), or 3 if block proposal scoring is enabled via
// expectedBlockProposalsPerSlot. Total P3b after pruning = -68 (2 topics) or -102 (3 topics).
//
// With appSpecificWeight=10, ~20 HighTolerance errors (-40 app score) plus max P3b (-68 or -102)
// would not cross gossipThreshold (-500). This keeps non-contributors from being disconnected
// unless they also accrue app-level penalties.
//
// The weight formula ensures max penalty equals MAX_P3_PENALTY_PER_TOPIC:
//   weight = MAX_P3_PENALTY_PER_TOPIC / threshold²
//   When deficit = threshold: penalty = threshold² * weight = MAX_P3_PENALTY_PER_TOPIC

/** Maximum P3 penalty per topic (must exceed P1 + P2 to cause pruning) */
export const MAX_P3_PENALTY_PER_TOPIC = -(MAX_P1_SCORE + MAX_P2_SCORE + 1); // -34

/**
 * Factory class for creating gossipsub topic scoring parameters.
 * Computes shared values once and reuses them across all topics.
 */
export class TopicScoreParamsFactory {
  /** Number of blocks per slot based on timetable configuration */
  public readonly blocksPerSlot: number;

  /** Decay factor for invalid message penalties (P4) */
  public readonly invalidDecay: number;

  /** Number of heartbeats per slot */
  public readonly heartbeatsPerSlot: number;

  /** P1: Time in mesh quantum (slot duration in ms - score increases by ~1 per slot) */
  public readonly timeInMeshQuantum: number;

  /** P1: Time in mesh cap (number of slots to reach max score) */
  public readonly timeInMeshCap: number;

  /** P1: Time in mesh weight (normalized so max P1 = MAX_P1_SCORE) */
  public readonly timeInMeshWeight: number;

  /** P2: First message deliveries decay factor */
  public readonly firstMessageDeliveriesDecay: number;

  /** P2: First message deliveries cap (convergence-based) */
  public readonly firstMessageDeliveriesCap: number;

  /** P2: First message deliveries weight (normalized so max P2 = MAX_P2_SCORE) */
  public readonly firstMessageDeliveriesWeight: number;

  /** Base parameters common to all topics */
  private readonly baseParams: {
    topicWeight: number;
    invalidMessageDeliveriesWeight: number;
    invalidMessageDeliveriesDecay: number;
    // P1: timeInMesh
    timeInMeshQuantum: number;
    timeInMeshCap: number;
    timeInMeshWeight: number;
    // P2: firstMessageDeliveries
    firstMessageDeliveriesDecay: number;
    firstMessageDeliveriesCap: number;
    firstMessageDeliveriesWeight: number;
  };

  constructor(private readonly params: TopicScoringNetworkParams) {
    const { slotDurationMs, heartbeatIntervalMs } = params;

    // Compute values that are the same for all topics. The block count comes straight from the shared
    // proposer timetable, so gossipsub scoring agrees with the proposer's max blocks per checkpoint.
    this.blocksPerSlot = params.timetable.getMaxBlocksPerCheckpoint();
    this.heartbeatsPerSlot = slotDurationMs / heartbeatIntervalMs;
    this.invalidDecay = computeDecay(heartbeatIntervalMs, slotDurationMs, INVALID_DECAY_WINDOW_SLOTS);

    // P1: timeInMesh - Lodestar style slot-based normalization
    // quantum = slot duration, so score increases by ~1 per slot of mesh membership
    // cap = number of slots in P1_CAP_TIME_SECONDS (1 hour)
    // weight = MAX_P1_SCORE / cap, so max P1 = cap * weight = MAX_P1_SCORE
    const slotDurationSeconds = slotDurationMs / 1000;
    this.timeInMeshQuantum = slotDurationMs;
    this.timeInMeshCap = P1_CAP_TIME_SECONDS / slotDurationSeconds;
    this.timeInMeshWeight = MAX_P1_SCORE / this.timeInMeshCap;

    // P2: firstMessageDeliveries - convergence-based cap with normalized weight
    // Uses fast decay (2 slots) so it rewards recent first deliveries
    // cap = convergence at 1 first delivery per heartbeat (theoretical max rate)
    // weight = MAX_P2_SCORE / cap, so max P2 = cap * weight = MAX_P2_SCORE
    this.firstMessageDeliveriesDecay = computeDecay(heartbeatIntervalMs, slotDurationMs, P2_DECAY_WINDOW_SLOTS);
    // Convergence for 1 message per heartbeat (generous estimate for first deliveries)
    this.firstMessageDeliveriesCap = computeConvergence(1, this.firstMessageDeliveriesDecay);
    this.firstMessageDeliveriesWeight = MAX_P2_SCORE / this.firstMessageDeliveriesCap;

    // Base params are identical for all topics
    this.baseParams = {
      topicWeight: 1,
      invalidMessageDeliveriesWeight: INVALID_MESSAGE_WEIGHT,
      invalidMessageDeliveriesDecay: this.invalidDecay,
      // P1: timeInMesh (same for all topics)
      timeInMeshQuantum: this.timeInMeshQuantum,
      timeInMeshCap: this.timeInMeshCap,
      timeInMeshWeight: this.timeInMeshWeight,
      // P2: firstMessageDeliveries (same for all topics)
      firstMessageDeliveriesDecay: this.firstMessageDeliveriesDecay,
      firstMessageDeliveriesCap: this.firstMessageDeliveriesCap,
      firstMessageDeliveriesWeight: this.firstMessageDeliveriesWeight,
    };
  }

  /**
   * Creates scoring parameters for topics with unpredictable or zero message rates.
   * Disables P1, P2, P3, and P3b to avoid unbalanced positive score accumulation.
   *
   * Rationale: If P1/P2 were enabled without P3, the topic would contribute free
   * positive scores that could offset penalties from other topics, preventing
   * proper mesh pruning of non-contributing peers.
   */
  private createDisabledP3Params(): ReturnType<typeof createTopicScoreParams> {
    return createTopicScoreParams({
      topicWeight: 1,
      // P1: timeInMesh - disabled (no free positive scores)
      timeInMeshQuantum: 1,
      timeInMeshCap: 0,
      timeInMeshWeight: 0,
      // P2: firstMessageDeliveries - disabled
      firstMessageDeliveriesDecay: 0.5,
      firstMessageDeliveriesCap: 0,
      firstMessageDeliveriesWeight: 0,
      // P3: meshMessageDeliveries - disabled
      meshMessageDeliveriesWeight: 0,
      meshMessageDeliveriesDecay: 0.5,
      meshMessageDeliveriesThreshold: 0,
      meshMessageDeliveriesWindow: 0,
      meshMessageDeliveriesActivation: 0,
      meshMessageDeliveriesCap: 0,
      // P3b: meshFailurePenalty - disabled
      meshFailurePenaltyWeight: 0,
      meshFailurePenaltyDecay: 0.5,
      // P4: invalidMessageDeliveries - still enabled for attack detection
      invalidMessageDeliveriesWeight: INVALID_MESSAGE_WEIGHT,
      invalidMessageDeliveriesDecay: this.invalidDecay,
    });
  }

  /**
   * Creates scoring parameters for topics with predictable message rates.
   * Enables P1, P2, P3, and P3b for balanced scoring.
   *
   * The scoring is designed so that:
   * - P1 + P2 max = 8 + 25 = 33 (positive rewards for good behavior)
   * - P3 max = -34 (penalty exceeds P1+P2 to ensure pruning of non-contributors)
   * - After pruning: P1 resets, P2 decays, P3b persists with slow decay
   *
   * @param expectedPerSlot - Expected messages per slot
   */
  private createEnabledP3Params(expectedPerSlot: number): ReturnType<typeof createTopicScoreParams> {
    const { slotDurationMs, heartbeatIntervalMs } = this.params;

    // Calculate decay based on message frequency
    const decayWindowSlots = getDecayWindowSlots(expectedPerSlot);
    const decay = computeDecay(heartbeatIntervalMs, slotDurationMs, decayWindowSlots);

    // Calculate convergence and threshold
    const messagesPerHeartbeat = expectedPerSlot / this.heartbeatsPerSlot;
    const convergence = computeConvergence(messagesPerHeartbeat, decay);
    const threshold = computeThreshold(convergence, CONSERVATIVE_FACTOR);

    // Cap factor: higher for high-volume topics
    const capFactor = expectedPerSlot > 10 ? 8 : 4;

    // P3 Weight: scaled so max penalty = MAX_P3_PENALTY_PER_TOPIC (-34)
    // When deficit = threshold (peer delivers nothing):
    //   penalty = deficit² × weight = threshold² × (MAX_P3_PENALTY_PER_TOPIC / threshold²) = MAX_P3_PENALTY_PER_TOPIC
    const meshDeliveriesWeight = threshold > 0 ? MAX_P3_PENALTY_PER_TOPIC / (threshold * threshold) : 0;

    // Activation time: use the decay window multiplied by ACTIVATION_MULTIPLIER for extra grace
    // during network bootstrap. The timer starts from mesh join time, not from first message,
    // so peers joining before messages flow need extra time to accumulate counter values.
    const activationMs = slotDurationMs * decayWindowSlots * ACTIVATION_MULTIPLIER;

    return createTopicScoreParams({
      ...this.baseParams,
      // P3: meshMessageDeliveries
      meshMessageDeliveriesWeight: meshDeliveriesWeight,
      meshMessageDeliveriesDecay: decay,
      meshMessageDeliveriesThreshold: threshold,
      meshMessageDeliveriesWindow: MESH_DELIVERIES_WINDOW_MS,
      meshMessageDeliveriesActivation: activationMs,
      meshMessageDeliveriesCap: Math.max(threshold * capFactor, 2),
      // P3b: meshFailurePenalty (same weight and decay as P3)
      meshFailurePenaltyWeight: meshDeliveriesWeight,
      meshFailurePenaltyDecay: decay,
    });
  }

  /** Number of topics with P3 enabled, computed from config. Always 2 (checkpoint_proposal + checkpoint_attestation) plus optionally block_proposal. */
  get numP3EnabledTopics(): number {
    const blockProposalP3Enabled =
      getEffectiveBlockProposalsPerSlot(this.blocksPerSlot, this.params.expectedBlockProposalsPerSlot) !== undefined;
    return blockProposalP3Enabled ? 3 : 2;
  }

  /** Total maximum P3b penalty across all topics after pruning, computed from config */
  get totalMaxP3bPenalty(): number {
    return MAX_P3_PENALTY_PER_TOPIC * this.numP3EnabledTopics;
  }

  /**
   * Creates topic score parameters for a specific topic type.
   *
   * @param topicType - The topic type
   * @returns TopicScoreParams for the topic
   */
  createForTopic(topicType: TopicType): ReturnType<typeof createTopicScoreParams> {
    const expectedPerSlot = getExpectedMessagesPerSlot(
      topicType,
      this.params.targetCommitteeSize,
      this.blocksPerSlot,
      this.params.expectedBlockProposalsPerSlot,
    );

    // For unpredictable topics (tx) or topics with 0 expected messages, disable P3/P3b
    if (expectedPerSlot === undefined || expectedPerSlot === 0) {
      return this.createDisabledP3Params();
    }

    return this.createEnabledP3Params(expectedPerSlot);
  }

  /**
   * Creates all topic score parameters for gossipsub configuration.
   *
   * @param protocolVersion - Protocol version string for topic naming
   * @returns Record mapping topic strings to their score parameters
   */
  createAll(protocolVersion: string): Record<string, ReturnType<typeof createTopicScoreParams>> {
    const topics: Record<string, ReturnType<typeof createTopicScoreParams>> = {};

    for (const topicType of Object.values(TopicType)) {
      const topicString = createTopicString(topicType, protocolVersion);
      topics[topicString] = this.createForTopic(topicType);
    }

    return topics;
  }
}

/**
 * Creates topic score parameters for a specific topic type.
 * Convenience function that creates a factory internally.
 *
 * @param topicType - The topic type
 * @param params - Network parameters for scoring calculation
 * @returns TopicScoreParams for the topic
 */
export function createTopicScoreParamsForTopic(
  topicType: TopicType,
  params: TopicScoringNetworkParams,
): ReturnType<typeof createTopicScoreParams> {
  const factory = new TopicScoreParamsFactory(params);
  return factory.createForTopic(topicType);
}

/**
 * Creates all topic score parameters for gossipsub configuration.
 *
 * @param protocolVersion - Protocol version string for topic naming
 * @param params - Network parameters for scoring calculation
 * @returns Record mapping topic strings to their score parameters
 */
export function createAllTopicScoreParams(
  protocolVersion: string,
  params: TopicScoringNetworkParams,
): Record<string, ReturnType<typeof createTopicScoreParams>> {
  const factory = new TopicScoreParamsFactory(params);
  return factory.createAll(protocolVersion);
}
