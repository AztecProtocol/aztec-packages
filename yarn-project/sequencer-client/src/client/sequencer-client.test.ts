import { MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT } from '@aztec/constants';
import { createLogger } from '@aztec/foundation/log';

import type { SequencerClientConfig } from '../config.js';
import { computeBlockLimits } from './sequencer-client.js';

describe('computeBlockLimits', () => {
  const log = createLogger('test');

  /** Builds a minimal config with only the fields needed by computeBlockLimits. */
  function makeConfig(overrides: Partial<SequencerClientConfig> = {}): SequencerClientConfig {
    return {
      ethereumSlotDuration: 12,
      aztecSlotDuration: 72,
      attestationPropagationTime: 3,
      enforceTimeTable: true,
      // No blockDurationMs -> single block mode -> maxNumberOfBlocks = 1
      ...overrides,
    } as SequencerClientConfig;
  }

  describe('L2 gas', () => {
    it('derives maxL2BlockGas from rollupManaLimit when not explicitly set', () => {
      const rollupManaLimit = 1_000_000;
      // Single block mode (maxNumberOfBlocks=1), default multiplier=1.2:
      // min(1_000_000, ceil(1_000_000 / 1 * 1.2)) = min(1_000_000, 1_200_000) = 1_000_000
      const result = computeBlockLimits(makeConfig(), rollupManaLimit, 12, log);
      expect(result.maxL2BlockGas).toBe(rollupManaLimit);
    });

    it('uses explicit maxL2BlockGas when within rollupManaLimit', () => {
      const result = computeBlockLimits(makeConfig({ maxL2BlockGas: 500_000 }), 1_000_000, 12, log);
      expect(result.maxL2BlockGas).toBe(500_000);
    });

    it('caps explicit maxL2BlockGas at rollupManaLimit', () => {
      const result = computeBlockLimits(makeConfig({ maxL2BlockGas: 2_000_000 }), 1_000_000, 12, log);
      expect(result.maxL2BlockGas).toBe(1_000_000);
    });
  });

  describe('DA gas', () => {
    const daLimit = MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT;

    it('derives maxDABlockGas from DA checkpoint limit when not explicitly set', () => {
      // Single block mode (maxNumberOfBlocks=1), default multiplier=1.2:
      // min(daLimit, ceil(daLimit / 1 * 1.2)) = min(daLimit, daLimit * 1.2) = daLimit
      const result = computeBlockLimits(makeConfig(), 1_000_000, 12, log);
      expect(result.maxDABlockGas).toBe(daLimit);
    });

    it('uses explicit maxDABlockGas when within DA checkpoint limit', () => {
      const explicit = Math.floor(daLimit / 2);
      const result = computeBlockLimits(makeConfig({ maxDABlockGas: explicit }), 1_000_000, 12, log);
      expect(result.maxDABlockGas).toBe(explicit);
    });

    it('caps explicit maxDABlockGas at DA checkpoint limit', () => {
      const result = computeBlockLimits(makeConfig({ maxDABlockGas: daLimit + 100_000 }), 1_000_000, 12, log);
      expect(result.maxDABlockGas).toBe(daLimit);
    });
  });

  describe('TX count', () => {
    it('uses explicit maxTxsPerBlock when set', () => {
      const result = computeBlockLimits(makeConfig({ maxTxsPerBlock: 10 }), 1_000_000, 12, log);
      expect(result.maxTxsPerBlock).toBe(10);
    });

    it('caps maxTxsPerBlock at maxTxsPerCheckpoint', () => {
      const result = computeBlockLimits(
        makeConfig({ maxTxsPerBlock: 50, maxTxsPerCheckpoint: 30 }),
        1_000_000,
        12,
        log,
      );
      expect(result.maxTxsPerBlock).toBe(30);
    });

    it('derives maxTxsPerBlock from maxTxsPerCheckpoint when per-block not set', () => {
      // Multi-block mode with maxNumberOfBlocks=5, multiplier=1.2:
      // min(100, ceil(100 / 5 * 1.2)) = min(100, 24) = 24
      const config = makeConfig({
        maxTxsPerCheckpoint: 100,
        blockDurationMs: 8000,
      });
      const result = computeBlockLimits(config, 1_000_000, 12, log);
      expect(result.maxTxsPerBlock).toBe(24);
    });
  });

  describe('multi-block mode', () => {
    it('distributes budget across blocks in multi-block mode', () => {
      // With blockDurationMs=8000, aztecSlotDuration=72, ethereumSlotDuration=12,
      // attestationPropagationTime=3, l1PublishingTime=12:
      //   checkpointFinalizationTime = 1 + 3*2 + 12 = 19
      //   timeReservedAtEnd = 8 + 19 = 27
      //   timeAvailableForBlocks = 72 - 1 - 27 = 44
      //   maxNumberOfBlocks = floor(44 / 8) = 5
      // With multiplier=1.2 and rollupManaLimit=1_000_000:
      //   maxL2BlockGas = min(1_000_000, ceil(1_000_000 / 5 * 1.2)) = min(1_000_000, 240_000) = 240_000
      const config = makeConfig({ blockDurationMs: 8000 });
      const result = computeBlockLimits(config, 1_000_000, 12, log);
      expect(result.maxL2BlockGas).toBe(240_000);

      const daLimit = MAX_PROCESSABLE_DA_GAS_PER_CHECKPOINT;
      expect(result.maxDABlockGas).toBe(Math.min(daLimit, Math.ceil((daLimit / 5) * 1.2)));
    });

    it('returns maxBlocksPerCheckpoint from timetable', () => {
      const config = makeConfig({ blockDurationMs: 8000 });
      const result = computeBlockLimits(config, 1_000_000, 12, log);
      expect(result.maxBlocksPerCheckpoint).toBe(5);
    });
  });
});
