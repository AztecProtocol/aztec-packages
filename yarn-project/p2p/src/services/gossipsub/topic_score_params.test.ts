import { TopicType, createTopicString } from '@aztec/stdlib/p2p';

import { describe, expect, it } from '@jest/globals';

import {
  TopicScoreParamsFactory,
  calculateBlocksPerSlot,
  computeConvergence,
  computeDecay,
  computeThreshold,
  createAllTopicScoreParams,
  createTopicScoreParamsForTopic,
  getDecayWindowSlots,
  getExpectedMessagesPerSlot,
} from './topic_score_params.js';

describe('Topic Score Params', () => {
  // Standard network parameters for testing (matching production values)
  const standardParams = {
    slotDurationMs: 72000, // 72 seconds
    decayIntervalMs: 1000, // 1s gossipsub score decay interval
    targetCommitteeSize: 48,
  };

  describe('calculateBlocksPerSlot', () => {
    it('returns 1 when blockDurationMs is undefined (single block mode)', () => {
      expect(calculateBlocksPerSlot(72000, undefined)).toBe(1);
    });

    it('returns 1 when blockDurationMs is 0', () => {
      // Edge case - should treat 0 as undefined
      expect(calculateBlocksPerSlot(72000, 0)).toBe(1);
    });

    it('calculates correct blocks per slot for MBPS mode', () => {
      // With 72s slot and 10s block duration
      // Using timetable formula: floor((72 - 1 - 10 - (1 + 2*2 + 12)) / 10)
      // = floor((72 - 1 - 10 - 17) / 10) = floor(44 / 10) = 4
      const result = calculateBlocksPerSlot(72000, 10000);
      expect(result).toBeGreaterThanOrEqual(1);
    });

    it('returns at least 1 block per slot', () => {
      // Even with very long block duration, should return at least 1
      const result = calculateBlocksPerSlot(72000, 60000);
      expect(result).toBeGreaterThanOrEqual(1);
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
      const decay = computeDecay(1000, 72000, 5);
      expect(decay).toBeGreaterThan(0);
      expect(decay).toBeLessThan(1);
    });

    it('produces ~1% after decayIntervalsInWindow iterations', () => {
      const decayIntervalMs = 1000;
      const slotMs = 72000;
      const decayWindowSlots = 5;

      const decay = computeDecay(decayIntervalMs, slotMs, decayWindowSlots);

      // Verify: decay^decayIntervalsInWindow should be approximately 0.01
      const decayIntervalsPerSlot = slotMs / decayIntervalMs;
      const decayIntervalsInWindow = decayIntervalsPerSlot * decayWindowSlots;
      const result = Math.pow(decay, decayIntervalsInWindow);

      expect(result).toBeCloseTo(0.01, 5);
    });

    it('returns higher decay factor for longer windows', () => {
      // Longer window = slower decay = higher decay factor (closer to 1)
      const shortWindow = computeDecay(1000, 72000, 2);
      const longWindow = computeDecay(1000, 72000, 5);

      expect(longWindow).toBeGreaterThan(shortWindow);
    });

    it('returns higher decay factor for shorter decay intervals', () => {
      // More decay steps = need slower decay per step
      const longInterval = computeDecay(2000, 72000, 5);
      const shortInterval = computeDecay(1000, 72000, 5);

      expect(shortInterval).toBeGreaterThan(longInterval);
    });
  });

  describe('computeConvergence', () => {
    it('returns rate / (1 - decay) for geometric series', () => {
      const messagesPerDecayInterval = 0.1;
      const decay = 0.9;

      const convergence = computeConvergence(messagesPerDecayInterval, decay);

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

  describe('getExpectedMessagesPerSlot', () => {
    it('returns undefined for tx topic (unpredictable)', () => {
      expect(getExpectedMessagesPerSlot(TopicType.tx, 48, 5)).toBeUndefined();
    });

    it('returns N-1 for block_proposal in MBPS mode', () => {
      expect(getExpectedMessagesPerSlot(TopicType.block_proposal, 48, 5)).toBe(4);
      expect(getExpectedMessagesPerSlot(TopicType.block_proposal, 48, 3)).toBe(2);
    });

    it('returns 0 for block_proposal in single block mode', () => {
      expect(getExpectedMessagesPerSlot(TopicType.block_proposal, 48, 1)).toBe(0);
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
      expect(factory.decayIntervalsPerSlot).toBeCloseTo(72000 / 1000);
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

      it('enables P3/P3b for block_proposal in MBPS mode', () => {
        const factory = new TopicScoreParamsFactory({ ...standardParams, blockDurationMs: 10000 });
        const params = factory.createForTopic(TopicType.block_proposal);

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
      const decay = computeDecay(1000, 72000, 5);
      let counter = 100;

      // Simulate several decay intervals
      for (let i = 0; i < 10; i++) {
        const newCounter = counter * decay;
        expect(newCounter).toBeLessThan(counter);
        counter = newCounter;
      }
    });

    it('counter with constant input converges to expected value', () => {
      const messagesPerDecayInterval = 0.5;
      const decay = computeDecay(1000, 72000, 5);
      const expectedConvergence = computeConvergence(messagesPerDecayInterval, decay);

      // Simulate many decay intervals with constant message arrival
      let counter = 0;
      for (let i = 0; i < 1000; i++) {
        counter = counter * decay + messagesPerDecayInterval;
      }

      // Counter should converge close to expected value
      expect(counter).toBeCloseTo(expectedConvergence, 1);
    });

    it('weight produces meaningful penalty when below threshold', () => {
      const factory = new TopicScoreParamsFactory(standardParams);
      const params = factory.createForTopic(TopicType.checkpoint_proposal);

      const threshold = params.meshMessageDeliveriesThreshold;
      const weight = params.meshMessageDeliveriesWeight;

      // If counter is 0 (way below threshold), penalty should be threshold^2 * |weight| = 1
      // deficit = max(0, threshold - counter)^2 = threshold^2
      // penalty = deficit * weight (negative)
      const penalty = threshold * threshold * weight;

      // Should produce a meaningful negative penalty (around -1)
      expect(penalty).toBeLessThan(0);
      expect(penalty).toBeCloseTo(-1, 5);
    });
  });

  describe('realistic network scenarios', () => {
    it('configures checkpoint_proposal for 1 msg/slot', () => {
      const params = createTopicScoreParamsForTopic(TopicType.checkpoint_proposal, standardParams);

      // Should use 5-slot decay window for 1 msg/slot
      // Threshold should be ~30% of convergence
      expect(params.meshMessageDeliveriesThreshold).toBeGreaterThan(0);
      expect(params.meshMessageDeliveriesThreshold).toBeLessThan(1); // Below 1 msg due to 30% factor

      // Activation should match decay window (5 slots) so counter can converge
      expect(params.meshMessageDeliveriesActivation).toBe(72000 * 5);

      // Window should be 5 seconds
      expect(params.meshMessageDeliveriesWindow).toBe(5000);
    });

    it('configures checkpoint_attestation for 48 msg/slot', () => {
      const params = createTopicScoreParamsForTopic(TopicType.checkpoint_attestation, standardParams);

      // Should use 2-slot decay window for high volume
      // Threshold should be ~30% of convergence for 48 msgs/slot
      expect(params.meshMessageDeliveriesThreshold).toBeGreaterThan(1);

      // Activation should match decay window (2 slots) so counter can converge
      expect(params.meshMessageDeliveriesActivation).toBe(72000 * 2);

      // Cap should use 8x factor for high volume topics
      expect(params.meshMessageDeliveriesCap).toBeGreaterThanOrEqual(params.meshMessageDeliveriesThreshold * 8);
    });
  });
});
