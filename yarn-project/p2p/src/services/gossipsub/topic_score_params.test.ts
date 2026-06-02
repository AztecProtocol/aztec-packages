import { TopicType, createTopicString } from '@aztec/stdlib/p2p';

import { describe, expect, it } from '@jest/globals';

import {
  MAX_P3_PENALTY_PER_TOPIC,
  TopicScoreParamsFactory,
  calculateBlocksPerSlot,
  computeConvergence,
  computeDecay,
  computeThreshold,
  createAllTopicScoreParams,
  createTopicScoreParamsForTopic,
  getDecayWindowSlots,
  getEffectiveBlockProposalsPerSlot,
  getExpectedMessagesPerSlot,
} from './topic_score_params.js';

describe('Topic Score Params', () => {
  // Standard network parameters for testing (matching production values)
  const standardParams = {
    slotDurationMs: 72000, // 72 seconds
    ethereumSlotDuration: 12,
    heartbeatIntervalMs: 700, // 700ms gossipsub heartbeat
    targetCommitteeSize: 48,
    checkpointProposalPrepareTime: 1,
  };

  describe('calculateBlocksPerSlot', () => {
    it('returns 1 when blockDurationMs is undefined (single block mode)', () => {
      expect(calculateBlocksPerSlot(72000, undefined)).toBe(1);
    });

    it('returns 1 when blockDurationMs is 0', () => {
      // Edge case - should treat 0 as undefined
      expect(calculateBlocksPerSlot(72000, 0)).toBe(1);
    });

    it('matches the production worked example (10 blocks)', () => {
      // floor((72 - 6 - 2*2 - 1) / 6) = floor(61/6) = 10
      const result = calculateBlocksPerSlot(72000, 6000, {
        ethereumSlotDuration: 12,
        p2pPropagationTime: 2,
        checkpointProposalPrepareTime: 1,
      });
      expect(result).toBe(10);
    });

    it('matches the local fast profile (4 blocks)', () => {
      // floor((36 - 6 - 2*0.5 - 0.5) / 6) = floor(28.5/6) = 4
      const result = calculateBlocksPerSlot(36000, 6000, {
        ethereumSlotDuration: 4,
        p2pPropagationTime: 0.5,
        checkpointProposalPrepareTime: 0.5,
      });
      expect(result).toBe(4);
    });

    it('returns 0 for an impossible timing configuration (no room for a full block)', () => {
      // floor((72 - 60 - 2*2 - 1) / 60) = floor(7/60) = 0; the pure fn does not throw, the proposer
      // timetable constructor enforces the >= 1 minimum.
      expect(calculateBlocksPerSlot(72000, 60000)).toBe(0);
    });
  });

  describe('getDecayWindowSlots', () => {
    it('returns 5 slots for low frequency topics (<=1 msg/slot)', () => {
      expect(getDecayWindowSlots(0)).toBe(5);
      expect(getDecayWindowSlots(0.5)).toBe(5);
      expect(getDecayWindowSlots(1)).toBe(5);
    });

    it('returns 3 slots for medium frequency topics (2-10 msg/slot)', () => {
      expect(getDecayWindowSlots(2)).toBe(3);
      expect(getDecayWindowSlots(5)).toBe(3);
      expect(getDecayWindowSlots(10)).toBe(3);
    });

    it('returns 2 slots for high frequency topics (>10 msg/slot)', () => {
      expect(getDecayWindowSlots(11)).toBe(2);
      expect(getDecayWindowSlots(48)).toBe(2);
      expect(getDecayWindowSlots(100)).toBe(2);
    });
  });

  describe('computeDecay', () => {
    it('returns a value between 0 and 1', () => {
      const decay = computeDecay(700, 72000, 5);
      expect(decay).toBeGreaterThan(0);
      expect(decay).toBeLessThan(1);
    });

    it('produces ~1% after heartbeatsInWindow iterations', () => {
      const heartbeatMs = 700;
      const slotMs = 72000;
      const decayWindowSlots = 5;

      const decay = computeDecay(heartbeatMs, slotMs, decayWindowSlots);

      // Verify: decay^heartbeatsInWindow should be approximately 0.01
      const heartbeatsPerSlot = slotMs / heartbeatMs;
      const heartbeatsInWindow = heartbeatsPerSlot * decayWindowSlots;
      const result = Math.pow(decay, heartbeatsInWindow);

      expect(result).toBeCloseTo(0.01, 5);
    });

    it('returns higher decay factor for longer windows', () => {
      // Longer window = slower decay = higher decay factor (closer to 1)
      const shortWindow = computeDecay(700, 72000, 2);
      const longWindow = computeDecay(700, 72000, 5);

      expect(longWindow).toBeGreaterThan(shortWindow);
    });

    it('returns higher decay factor for shorter heartbeat intervals', () => {
      // More heartbeats = need slower decay per heartbeat
      const longHeartbeat = computeDecay(1000, 72000, 5);
      const shortHeartbeat = computeDecay(500, 72000, 5);

      expect(shortHeartbeat).toBeGreaterThan(longHeartbeat);
    });
  });

  describe('computeConvergence', () => {
    it('returns rate / (1 - decay) for geometric series', () => {
      const messagesPerHeartbeat = 0.1;
      const decay = 0.9;

      const convergence = computeConvergence(messagesPerHeartbeat, decay);

      // Expected: 0.1 / (1 - 0.9) = 0.1 / 0.1 = 1
      expect(convergence).toBeCloseTo(1, 10);
    });

    it('returns higher convergence for higher message rates', () => {
      const decay = 0.9;
      const lowRate = computeConvergence(0.1, decay);
      const highRate = computeConvergence(1.0, decay);

      expect(highRate).toBeGreaterThan(lowRate);
    });

    it('returns higher convergence for higher decay (slower decay)', () => {
      const rate = 0.1;
      const fastDecay = computeConvergence(rate, 0.8);
      const slowDecay = computeConvergence(rate, 0.95);

      expect(slowDecay).toBeGreaterThan(fastDecay);
    });
  });

  describe('computeThreshold', () => {
    it('returns convergence * conservativeFactor', () => {
      const convergence = 10;
      const factor = 0.3;

      expect(computeThreshold(convergence, factor)).toBe(3);
    });

    it('returns 0 when convergence is 0', () => {
      expect(computeThreshold(0, 0.3)).toBe(0);
    });
  });

  describe('getEffectiveBlockProposalsPerSlot', () => {
    it('returns undefined when override is 0 (disabled)', () => {
      expect(getEffectiveBlockProposalsPerSlot(5, 0)).toBeUndefined();
    });

    it('returns override value when positive', () => {
      expect(getEffectiveBlockProposalsPerSlot(5, 3)).toBe(3);
      expect(getEffectiveBlockProposalsPerSlot(1, 7)).toBe(7);
    });

    it('falls back to blocksPerSlot - 1 when override is undefined', () => {
      expect(getEffectiveBlockProposalsPerSlot(5, undefined)).toBe(4);
      expect(getEffectiveBlockProposalsPerSlot(3, undefined)).toBe(2);
    });

    it('returns undefined when override is undefined and single block mode', () => {
      expect(getEffectiveBlockProposalsPerSlot(1, undefined)).toBeUndefined();
    });
  });

  describe('getExpectedMessagesPerSlot', () => {
    it('returns undefined for tx topic (unpredictable)', () => {
      expect(getExpectedMessagesPerSlot(TopicType.tx, 48, 5)).toBeUndefined();
    });

    it('returns N-1 for block_proposal when override is undefined (fallback)', () => {
      expect(getExpectedMessagesPerSlot(TopicType.block_proposal, 48, 5)).toBe(4);
      expect(getExpectedMessagesPerSlot(TopicType.block_proposal, 48, 3)).toBe(2);
    });

    it('returns undefined for block_proposal in single block mode without override', () => {
      expect(getExpectedMessagesPerSlot(TopicType.block_proposal, 48, 1)).toBeUndefined();
    });

    it('returns undefined for block_proposal when override is 0 (disabled)', () => {
      expect(getExpectedMessagesPerSlot(TopicType.block_proposal, 48, 5, 0)).toBeUndefined();
    });

    it('returns override value for block_proposal when positive', () => {
      expect(getExpectedMessagesPerSlot(TopicType.block_proposal, 48, 1, 3)).toBe(3);
      expect(getExpectedMessagesPerSlot(TopicType.block_proposal, 48, 5, 7)).toBe(7);
    });

    it('returns 1 for checkpoint_proposal', () => {
      expect(getExpectedMessagesPerSlot(TopicType.checkpoint_proposal, 48, 5)).toBe(1);
      expect(getExpectedMessagesPerSlot(TopicType.checkpoint_proposal, 48, 1)).toBe(1);
    });

    it('returns committee size for checkpoint_attestation', () => {
      expect(getExpectedMessagesPerSlot(TopicType.checkpoint_attestation, 48, 5)).toBe(48);
      expect(getExpectedMessagesPerSlot(TopicType.checkpoint_attestation, 100, 5)).toBe(100);
    });
  });

  describe('TopicScoreParamsFactory', () => {
    it('computes shared values once', () => {
      const factory = new TopicScoreParamsFactory(standardParams);

      expect(factory.blocksPerSlot).toBe(1); // undefined blockDuration = single block
      expect(factory.heartbeatsPerSlot).toBeCloseTo(72000 / 700);
      expect(factory.invalidDecay).toBeGreaterThan(0);
      expect(factory.invalidDecay).toBeLessThan(1);
    });

    it('uses provided blockDurationMs', () => {
      const factory = new TopicScoreParamsFactory({ ...standardParams, blockDurationMs: 10000 });

      expect(factory.blocksPerSlot).toBeGreaterThan(1);
    });

    describe('createForTopic', () => {
      it('disables P3/P3b for tx topic', () => {
        const factory = new TopicScoreParamsFactory(standardParams);
        const params = factory.createForTopic(TopicType.tx);

        expect(params.meshMessageDeliveriesWeight).toBe(0);
        expect(params.meshFailurePenaltyWeight).toBe(0);
      });

      it('disables P3/P3b for block_proposal in single block mode', () => {
        const factory = new TopicScoreParamsFactory(standardParams);
        const params = factory.createForTopic(TopicType.block_proposal);

        // Single block mode = 0 block proposals = disabled
        expect(params.meshMessageDeliveriesWeight).toBe(0);
        expect(params.meshFailurePenaltyWeight).toBe(0);
      });

      it('disables P3/P3b for block_proposal in MBPS mode when expectedBlockProposalsPerSlot is 0', () => {
        const factory = new TopicScoreParamsFactory({
          ...standardParams,
          blockDurationMs: 10000,
          expectedBlockProposalsPerSlot: 0,
        });
        const params = factory.createForTopic(TopicType.block_proposal);

        expect(params.meshMessageDeliveriesWeight).toBe(0);
        expect(params.meshFailurePenaltyWeight).toBe(0);
      });

      it('enables P3/P3b for block_proposal when expectedBlockProposalsPerSlot is positive', () => {
        const factory = new TopicScoreParamsFactory({
          ...standardParams,
          blockDurationMs: 10000,
          expectedBlockProposalsPerSlot: 3,
        });
        const params = factory.createForTopic(TopicType.block_proposal);

        expect(params.meshMessageDeliveriesWeight).toBeLessThan(0);
        expect(params.meshFailurePenaltyWeight).toBeLessThan(0);
      });

      it('falls back to blocksPerSlot - 1 for block_proposal when expectedBlockProposalsPerSlot is undefined', () => {
        const factory = new TopicScoreParamsFactory({ ...standardParams, blockDurationMs: 10000 });
        const params = factory.createForTopic(TopicType.block_proposal);

        // MBPS mode with no override: falls back to blocksPerSlot - 1 > 0, so P3 is enabled
        expect(params.meshMessageDeliveriesWeight).toBeLessThan(0);
        expect(params.meshFailurePenaltyWeight).toBeLessThan(0);
      });

      it('enables P3/P3b for checkpoint_proposal', () => {
        const factory = new TopicScoreParamsFactory(standardParams);
        const params = factory.createForTopic(TopicType.checkpoint_proposal);

        expect(params.meshMessageDeliveriesWeight).toBeLessThan(0);
        expect(params.meshFailurePenaltyWeight).toBeLessThan(0);
        expect(params.meshMessageDeliveriesThreshold).toBeGreaterThan(0);
      });

      it('enables P3/P3b for checkpoint_attestation', () => {
        const factory = new TopicScoreParamsFactory(standardParams);
        const params = factory.createForTopic(TopicType.checkpoint_attestation);

        expect(params.meshMessageDeliveriesWeight).toBeLessThan(0);
        expect(params.meshFailurePenaltyWeight).toBeLessThan(0);
        expect(params.meshMessageDeliveriesThreshold).toBeGreaterThan(0);
      });

      it('sets higher threshold for attestation topic than checkpoint topic', () => {
        const factory = new TopicScoreParamsFactory(standardParams);
        const checkpointParams = factory.createForTopic(TopicType.checkpoint_proposal);
        const attestationParams = factory.createForTopic(TopicType.checkpoint_attestation);

        // Attestation has ~48 messages vs 1 for checkpoint, so higher threshold
        expect(attestationParams.meshMessageDeliveriesThreshold).toBeGreaterThan(
          checkpointParams.meshMessageDeliveriesThreshold,
        );
      });

      it('all topics have same base params (topicWeight, invalidMessageDeliveries)', () => {
        const factory = new TopicScoreParamsFactory(standardParams);

        const txParams = factory.createForTopic(TopicType.tx);
        const checkpointParams = factory.createForTopic(TopicType.checkpoint_proposal);
        const attestationParams = factory.createForTopic(TopicType.checkpoint_attestation);

        // All should have same topicWeight
        expect(txParams.topicWeight).toBe(1);
        expect(checkpointParams.topicWeight).toBe(1);
        expect(attestationParams.topicWeight).toBe(1);

        // All should have same invalidMessageDeliveries params
        expect(txParams.invalidMessageDeliveriesWeight).toBe(-20);
        expect(checkpointParams.invalidMessageDeliveriesWeight).toBe(-20);
        expect(attestationParams.invalidMessageDeliveriesWeight).toBe(-20);

        expect(txParams.invalidMessageDeliveriesDecay).toBe(checkpointParams.invalidMessageDeliveriesDecay);
        expect(checkpointParams.invalidMessageDeliveriesDecay).toBe(attestationParams.invalidMessageDeliveriesDecay);
      });
    });

    describe('createAll', () => {
      it('creates params for all topic types', () => {
        const factory = new TopicScoreParamsFactory(standardParams);
        const allParams = factory.createAll('0.1.0');

        const topicTypes = Object.values(TopicType);
        expect(Object.keys(allParams).length).toBe(topicTypes.length);

        for (const topicType of topicTypes) {
          const topicString = createTopicString(topicType, '0.1.0');
          expect(allParams[topicString]).toBeDefined();
        }
      });
    });
  });

  describe('createTopicScoreParamsForTopic (convenience function)', () => {
    it('creates params for tx topic', () => {
      const params = createTopicScoreParamsForTopic(TopicType.tx, standardParams);

      expect(params.topicWeight).toBe(1);
      expect(params.meshMessageDeliveriesWeight).toBe(0);
    });

    it('creates params for checkpoint_attestation topic', () => {
      const params = createTopicScoreParamsForTopic(TopicType.checkpoint_attestation, standardParams);

      expect(params.topicWeight).toBe(1);
      expect(params.meshMessageDeliveriesWeight).toBeLessThan(0);
    });
  });

  describe('createAllTopicScoreParams (convenience function)', () => {
    it('creates params for all topics', () => {
      const allParams = createAllTopicScoreParams('0.1.0', standardParams);

      expect(Object.keys(allParams).length).toBe(Object.values(TopicType).length);
    });

    it('uses correct topic string format', () => {
      const allParams = createAllTopicScoreParams('0.1.0', standardParams);
      const expectedTopicString = createTopicString(TopicType.tx, '0.1.0');

      expect(allParams[expectedTopicString]).toBeDefined();
    });
  });

  describe('mathematical properties', () => {
    it('decay factor produces decreasing counter values', () => {
      const decay = computeDecay(700, 72000, 5);
      let counter = 100;

      // Simulate several heartbeats
      for (let i = 0; i < 10; i++) {
        const newCounter = counter * decay;
        expect(newCounter).toBeLessThan(counter);
        counter = newCounter;
      }
    });

    it('counter with constant input converges to expected value', () => {
      const messagesPerHeartbeat = 0.5;
      const decay = computeDecay(700, 72000, 5);
      const expectedConvergence = computeConvergence(messagesPerHeartbeat, decay);

      // Simulate many heartbeats with constant message arrival
      let counter = 0;
      for (let i = 0; i < 1000; i++) {
        counter = counter * decay + messagesPerHeartbeat;
      }

      // Counter should converge close to expected value
      expect(counter).toBeCloseTo(expectedConvergence, 1);
    });

    it('weight produces meaningful penalty when below threshold', () => {
      const factory = new TopicScoreParamsFactory(standardParams);
      const params = factory.createForTopic(TopicType.checkpoint_proposal);

      const threshold = params.meshMessageDeliveriesThreshold;
      const weight = params.meshMessageDeliveriesWeight;

      // If counter is 0 (way below threshold), penalty should be threshold^2 * |weight| = MAX_P3_PENALTY_PER_TOPIC
      // deficit = max(0, threshold - counter)^2 = threshold^2
      // penalty = deficit * weight (negative)
      const penalty = threshold * threshold * weight;

      // Should produce max penalty of MAX_P3_PENALTY_PER_TOPIC (-34)
      // This exceeds P1 + P2 (33) to ensure non-contributing peers get pruned
      expect(penalty).toBeLessThan(0);
      expect(penalty).toBeCloseTo(MAX_P3_PENALTY_PER_TOPIC, 5);
    });
  });

  describe('realistic network scenarios', () => {
    it('configures checkpoint_proposal for 1 msg/slot', () => {
      const params = createTopicScoreParamsForTopic(TopicType.checkpoint_proposal, standardParams);

      // Should use 5-slot decay window for 1 msg/slot
      // Threshold should be ~30% of convergence
      expect(params.meshMessageDeliveriesThreshold).toBeGreaterThan(0);
      expect(params.meshMessageDeliveriesThreshold).toBeLessThan(1); // Below 1 msg due to 30% factor

      // Activation should be 5x the decay window (5 slots × 5) for bootstrap grace period
      expect(params.meshMessageDeliveriesActivation).toBe(72000 * 5 * 5);

      // Window should be 5 seconds (balanced for TypeScript runtime)
      expect(params.meshMessageDeliveriesWindow).toBe(5000);
    });

    it('configures checkpoint_attestation for 48 msg/slot', () => {
      const params = createTopicScoreParamsForTopic(TopicType.checkpoint_attestation, standardParams);

      // Should use 2-slot decay window for high volume
      // Threshold should be ~30% of convergence for 48 msgs/slot
      expect(params.meshMessageDeliveriesThreshold).toBeGreaterThan(1);

      // Activation should be 5x the decay window (2 slots × 5) for bootstrap grace period
      expect(params.meshMessageDeliveriesActivation).toBe(72000 * 2 * 5);

      // Cap should use 8x factor for high volume topics
      expect(params.meshMessageDeliveriesCap).toBeGreaterThanOrEqual(params.meshMessageDeliveriesThreshold * 8);
    });
  });

  describe('P1/P2/P3 score balance', () => {
    it('P1 is configured with slot-based quantum for topics with P3 enabled', () => {
      const factory = new TopicScoreParamsFactory(standardParams);
      const params = factory.createForTopic(TopicType.checkpoint_proposal);

      // P1 quantum should be slot duration (score increases by ~1 per slot)
      expect(params.timeInMeshQuantum).toBe(standardParams.slotDurationMs);

      // P1 cap should be number of slots in 1 hour
      const expectedCap = 3600 / (standardParams.slotDurationMs / 1000);
      expect(params.timeInMeshCap).toBe(expectedCap);

      // P1 weight should give max score of MAX_P1_SCORE (8)
      const maxP1 = params.timeInMeshCap * params.timeInMeshWeight;
      expect(maxP1).toBeCloseTo(8, 5);
    });

    it('P2 is configured with convergence-based cap for topics with P3 enabled', () => {
      const factory = new TopicScoreParamsFactory(standardParams);
      const params = factory.createForTopic(TopicType.checkpoint_proposal);

      // P2 cap and weight should give max score of MAX_P2_SCORE (25)
      const maxP2 = params.firstMessageDeliveriesCap * params.firstMessageDeliveriesWeight;
      expect(maxP2).toBeCloseTo(25, 5);
    });

    it('P1 and P2 are disabled for tx topic (no free positive scores)', () => {
      const factory = new TopicScoreParamsFactory(standardParams);
      const params = factory.createForTopic(TopicType.tx);

      // P1 should be disabled (weight = 0 or cap = 0)
      expect(params.timeInMeshWeight).toBe(0);
      expect(params.timeInMeshCap).toBe(0);

      // P2 should be disabled
      expect(params.firstMessageDeliveriesWeight).toBe(0);
      expect(params.firstMessageDeliveriesCap).toBe(0);
    });

    it('P3 max penalty exceeds P1 + P2 to ensure pruning', () => {
      const factory = new TopicScoreParamsFactory(standardParams);
      const params = factory.createForTopic(TopicType.checkpoint_proposal);

      // Calculate max scores
      const maxP1 = params.timeInMeshCap * params.timeInMeshWeight;
      const maxP2 = params.firstMessageDeliveriesCap * params.firstMessageDeliveriesWeight;
      const maxP3 =
        params.meshMessageDeliveriesThreshold *
        params.meshMessageDeliveriesThreshold *
        params.meshMessageDeliveriesWeight;

      // P3 (negative) must exceed P1 + P2 (positive) for pruning to occur
      // |P3| > P1 + P2
      expect(Math.abs(maxP3)).toBeGreaterThan(maxP1 + maxP2);
    });

    it('total P3b is -102 when block proposal scoring is enabled (3 topics)', () => {
      const factory = new TopicScoreParamsFactory({
        ...standardParams,
        blockDurationMs: 4000,
        expectedBlockProposalsPerSlot: 3,
      });

      expect(factory.numP3EnabledTopics).toBe(3);
      expect(factory.totalMaxP3bPenalty).toBeCloseTo(-102, 0);

      const checkpointParams = factory.createForTopic(TopicType.checkpoint_proposal);
      const attestationParams = factory.createForTopic(TopicType.checkpoint_attestation);
      const blockParams = factory.createForTopic(TopicType.block_proposal);

      const p3Checkpoint =
        checkpointParams.meshMessageDeliveriesThreshold ** 2 * checkpointParams.meshMessageDeliveriesWeight;
      const p3Attestation =
        attestationParams.meshMessageDeliveriesThreshold ** 2 * attestationParams.meshMessageDeliveriesWeight;
      const p3Block = blockParams.meshMessageDeliveriesThreshold ** 2 * blockParams.meshMessageDeliveriesWeight;

      expect(p3Checkpoint).toBeCloseTo(-34, 0);
      expect(p3Attestation).toBeCloseTo(-34, 0);
      expect(p3Block).toBeCloseTo(-34, 0);
      expect(p3Checkpoint + p3Attestation + p3Block).toBeCloseTo(-102, 0);
    });

    it('total P3b is -68 when block proposal scoring is disabled (2 topics)', () => {
      const factory = new TopicScoreParamsFactory({
        ...standardParams,
        expectedBlockProposalsPerSlot: 0,
      });

      expect(factory.numP3EnabledTopics).toBe(2);
      expect(factory.totalMaxP3bPenalty).toBeCloseTo(-68, 0);
    });

    it('non-contributing peer has negative topic score and gets pruned', () => {
      const factory = new TopicScoreParamsFactory(standardParams);
      const params = factory.createForTopic(TopicType.checkpoint_proposal);

      // Simulate a peer that has been in mesh for 1 hour (max P1) but delivers nothing
      const maxP1 = params.timeInMeshCap * params.timeInMeshWeight; // ~8
      const p2Score = 0; // No first deliveries
      const maxP3Penalty = params.meshMessageDeliveriesThreshold ** 2 * params.meshMessageDeliveriesWeight; // ~-34

      const topicScore = maxP1 + p2Score + maxP3Penalty;

      // Topic score should be negative, causing mesh pruning
      expect(topicScore).toBeLessThan(0);
    });
  });
});
