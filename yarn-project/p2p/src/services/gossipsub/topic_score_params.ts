import { TopicType, createTopicString } from '@aztec/stdlib/p2p';
import { calculateMaxBlocksPerSlot } from '@aztec/stdlib/timetable';

import { createTopicScoreParams, defaultPeerScoreParams } from '@chainsafe/libp2p-gossipsub/score';

/**
 * Network parameters needed to compute topic-specific gossipsub scoring parameters.
 */
export type TopicScoringNetworkParams = {
  /** L2 slot duration in milliseconds */
  slotDurationMs: number;
  /** Gossipsub peer score decay interval in milliseconds (>= 1000). Defaults to libp2p-gossipsub's value. */
  decayIntervalMs?: number;
  /** Target committee size (number of validators expected to attest per slot) */
  targetCommitteeSize: number;
  /** Duration per block in milliseconds when building multiple blocks per slot. If undefined, single block mode. */
  blockDurationMs?: number;
};

/**
 * Calculates the number of blocks per slot based on timing parameters.
 * Uses the shared calculation from @aztec/stdlib/timetable.
 *
 * @param slotDurationMs - L2 slot duration in milliseconds
 * @param blockDurationMs - Duration per block in milliseconds (undefined = single block mode)
 * @returns Number of blocks per slot
 */
export function calculateBlocksPerSlot(slotDurationMs: number, blockDurationMs: number | undefined): number {
  return calculateMaxBlocksPerSlot(slotDurationMs / 1000, blockDurationMs ? blockDurationMs / 1000 : undefined);
}

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
 * After `decayIntervalsInWindow` decay intervals, the counter decays to ~1% of its original value.
 *
 * @param decayIntervalMs - Gossipsub score decay interval in milliseconds
 * @param slotDurationMs - L2 slot duration in milliseconds
 * @param decayWindowSlots - Number of slots over which to decay
 * @returns Decay factor (0 < decay < 1), applied each decay interval
 */
export function computeDecay(decayIntervalMs: number, slotDurationMs: number, decayWindowSlots: number): number {
  const decayIntervalsPerSlot = slotDurationMs / decayIntervalMs;
  const decayIntervalsInWindow = decayIntervalsPerSlot * decayWindowSlots;

  // Decay to 1% over the window: decay^decayIntervalsInWindow = 0.01
  // decay = 0.01^(1/decayIntervalsInWindow)
  return Math.pow(0.01, 1 / decayIntervalsInWindow);
}

/**
 * Computes the steady-state convergence value for a decaying counter.
 * If messages arrive at a constant rate and decay is applied each decay interval,
 * the counter converges to: rate / (1 - decay)
 *
 * @param messagesPerDecayInterval - Expected messages per decay interval
 * @param decay - Decay factor applied each decay interval
 * @returns Convergence value (steady-state counter value)
 */
export function computeConvergence(messagesPerDecayInterval: number, decay: number): number {
  return messagesPerDecayInterval / (1 - decay);
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
 * Gets the expected messages per slot for a given topic type.
 *
 * @param topicType - The topic type
 * @param targetCommitteeSize - Target committee size
 * @param blocksPerSlot - Number of blocks per slot
 * @returns Expected messages per slot, or undefined if unpredictable
 */
export function getExpectedMessagesPerSlot(
  topicType: TopicType,
  targetCommitteeSize: number,
  blocksPerSlot: number,
): number | undefined {
  switch (topicType) {
    case TopicType.tx:
      // Transactions are unpredictable - disable mesh message delivery scoring
      return undefined;

    case TopicType.block_proposal:
      // In MBPS mode, N-1 block proposals per slot (last one bundled with checkpoint)
      // In single block mode (blocksPerSlot=1), this is 0
      return Math.max(0, blocksPerSlot - 1);

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

/** Mesh message deliveries window in milliseconds (5 seconds) */
const MESH_DELIVERIES_WINDOW_MS = 5000;

/** Default gossipsub decay interval in milliseconds (from libp2p-gossipsub defaults) */
const DEFAULT_GOSSIPSUB_DECAY_INTERVAL_MS = defaultPeerScoreParams.decayInterval;

/**
 * Factory class for creating gossipsub topic scoring parameters.
 * Computes shared values once and reuses them across all topics.
 */
export class TopicScoreParamsFactory {
  /** Number of blocks per slot based on timetable configuration */
  public readonly blocksPerSlot: number;

  /** Decay factor for invalid message penalties (P4) */
  public readonly invalidDecay: number;

  /** Gossipsub score decay interval in milliseconds */
  public readonly decayIntervalMs: number;

  /** Number of decay intervals per slot */
  public readonly decayIntervalsPerSlot: number;

  /** Base parameters common to all topics */
  private readonly baseParams: {
    topicWeight: number;
    invalidMessageDeliveriesWeight: number;
    invalidMessageDeliveriesDecay: number;
  };

  constructor(private readonly params: TopicScoringNetworkParams) {
    const { slotDurationMs, blockDurationMs, decayIntervalMs } = params;

    // Compute values that are the same for all topics
    this.blocksPerSlot = calculateBlocksPerSlot(slotDurationMs, blockDurationMs);
    this.decayIntervalMs = decayIntervalMs ?? DEFAULT_GOSSIPSUB_DECAY_INTERVAL_MS;
    this.decayIntervalsPerSlot = slotDurationMs / this.decayIntervalMs;
    this.invalidDecay = computeDecay(this.decayIntervalMs, slotDurationMs, INVALID_DECAY_WINDOW_SLOTS);

    // Base params are identical for all topics
    this.baseParams = {
      topicWeight: 1,
      invalidMessageDeliveriesWeight: INVALID_MESSAGE_WEIGHT,
      invalidMessageDeliveriesDecay: this.invalidDecay,
    };
  }

  /**
   * Creates scoring parameters for topics with unpredictable or zero message rates.
   * Disables P3 (mesh message deliveries) and P3b (mesh failure penalty).
   */
  private createDisabledP3Params(): ReturnType<typeof createTopicScoreParams> {
    return createTopicScoreParams({
      ...this.baseParams,
      // Disable P3: meshMessageDeliveries
      meshMessageDeliveriesWeight: 0,
      meshMessageDeliveriesDecay: 0.5,
      meshMessageDeliveriesThreshold: 0,
      meshMessageDeliveriesWindow: 0,
      meshMessageDeliveriesActivation: 0,
      meshMessageDeliveriesCap: 0,
      // Disable P3b: meshFailurePenalty
      meshFailurePenaltyWeight: 0,
      meshFailurePenaltyDecay: 0.5,
    });
  }

  /**
   * Creates scoring parameters for topics with predictable message rates.
   * Enables P3 (mesh message deliveries) and P3b (mesh failure penalty).
   *
   * @param expectedPerSlot - Expected messages per slot
   */
  private createEnabledP3Params(expectedPerSlot: number): ReturnType<typeof createTopicScoreParams> {
    const { slotDurationMs } = this.params;

    // Calculate decay based on message frequency
    const decayWindowSlots = getDecayWindowSlots(expectedPerSlot);
    const decay = computeDecay(this.decayIntervalMs, slotDurationMs, decayWindowSlots);

    // Calculate convergence and threshold
    const messagesPerDecayInterval = expectedPerSlot / this.decayIntervalsPerSlot;
    const convergence = computeConvergence(messagesPerDecayInterval, decay);
    const threshold = computeThreshold(convergence, CONSERVATIVE_FACTOR);

    // Cap factor: higher for high-volume topics
    const capFactor = expectedPerSlot > 10 ? 8 : 4;

    // Weight: penalty inversely proportional to threshold squared
    const meshDeliveriesWeight = threshold > 0 ? -1 / (threshold * threshold) : 0;

    // Activation time: use the decay window so the counter has time to approach convergence
    // before penalties can be applied. This prevents penalizing honest peers who just joined.
    const activationMs = slotDurationMs * decayWindowSlots;

    return createTopicScoreParams({
      ...this.baseParams,
      // P3: meshMessageDeliveries
      meshMessageDeliveriesWeight: meshDeliveriesWeight,
      meshMessageDeliveriesDecay: decay,
      meshMessageDeliveriesThreshold: threshold,
      meshMessageDeliveriesWindow: MESH_DELIVERIES_WINDOW_MS,
      meshMessageDeliveriesActivation: activationMs,
      meshMessageDeliveriesCap: Math.max(threshold * capFactor, 2),
      // P3b: meshFailurePenalty (same as P3)
      meshFailurePenaltyWeight: meshDeliveriesWeight,
      meshFailurePenaltyDecay: decay,
    });
  }

  /**
   * Creates topic score parameters for a specific topic type.
   *
   * @param topicType - The topic type
   * @returns TopicScoreParams for the topic
   */
  createForTopic(topicType: TopicType): ReturnType<typeof createTopicScoreParams> {
    const expectedPerSlot = getExpectedMessagesPerSlot(topicType, this.params.targetCommitteeSize, this.blocksPerSlot);

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
