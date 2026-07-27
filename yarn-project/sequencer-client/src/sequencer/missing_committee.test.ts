import { BlockNumber, EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';
import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

import { jest } from '@jest/globals';

import {
  type MissingCommitteeContext,
  classifyMissingCommittee,
  findFirstEpochWithCommittee,
  logMissingCommittee,
} from './missing_committee.js';

describe('classifyMissingCommittee', () => {
  const base = { targetCommitteeSize: 48, hasProducedBlocks: false };

  it('reports awaiting-first-validators while bootstrapping with too few validators', () => {
    const result = classifyMissingCommittee({ ...base, attesterCount: 0, hasProducedBlocks: false });
    expect(result).toEqual({ cause: 'awaiting-first-validators', severity: 'info' });
  });

  it('still awaits first validators when partially filled and no blocks produced yet', () => {
    const result = classifyMissingCommittee({ ...base, attesterCount: 47, hasProducedBlocks: false });
    expect(result).toEqual({ cause: 'awaiting-first-validators', severity: 'info' });
  });

  it('warns about a shrunken validator set once the chain has produced blocks', () => {
    const result = classifyMissingCommittee({ ...base, attesterCount: 10, hasProducedBlocks: true });
    expect(result).toEqual({ cause: 'validator-set-shrank', severity: 'warn' });
  });

  it('reports awaiting-sampling-lag once enough validators are staked', () => {
    const result = classifyMissingCommittee({ ...base, attesterCount: 48, hasProducedBlocks: false });
    expect(result).toEqual({ cause: 'awaiting-sampling-lag', severity: 'info' });
  });

  it('prefers the sampling-lag cause over shrink even after blocks were produced', () => {
    const result = classifyMissingCommittee({ ...base, attesterCount: 3462, hasProducedBlocks: true });
    expect(result).toEqual({ cause: 'awaiting-sampling-lag', severity: 'info' });
  });
});

describe('findFirstEpochWithCommittee', () => {
  const targetCommitteeSize = 48;

  it('returns the first past epoch whose sample already met the target', () => {
    const result = findFirstEpochWithCommittee({
      candidates: [
        { epoch: EpochNumber(601), sampledAttesterCount: 10 },
        { epoch: EpochNumber(602), sampledAttesterCount: 48 },
        { epoch: EpochNumber(603), sampledAttesterCount: undefined },
      ],
      targetCommitteeSize,
    });
    expect(result).toEqual(EpochNumber(602));
  });

  it('projects the first future-sampled epoch when no past sample qualifies', () => {
    const result = findFirstEpochWithCommittee({
      candidates: [
        { epoch: EpochNumber(601), sampledAttesterCount: 10 },
        { epoch: EpochNumber(602), sampledAttesterCount: undefined },
      ],
      targetCommitteeSize,
    });
    expect(result).toEqual(EpochNumber(602));
  });

  it('returns the earliest qualifying epoch, scanning ascending', () => {
    // The predicate is not monotone, so a future sample time (undefined) that precedes a qualifying past
    // sample still wins — the earliest qualifying epoch is the answer.
    const result = findFirstEpochWithCommittee({
      candidates: [
        { epoch: EpochNumber(601), sampledAttesterCount: undefined },
        { epoch: EpochNumber(602), sampledAttesterCount: 50 },
      ],
      targetCommitteeSize,
    });
    expect(result).toEqual(EpochNumber(601));
  });

  it('returns undefined when nothing qualifies', () => {
    const result = findFirstEpochWithCommittee({
      candidates: [
        { epoch: EpochNumber(601), sampledAttesterCount: 10 },
        { epoch: EpochNumber(602), sampledAttesterCount: 20 },
      ],
      targetCommitteeSize,
    });
    expect(result).toBeUndefined();
  });
});

describe('logMissingCommittee', () => {
  const targetSlot = SlotNumber(2);
  const targetEpoch = EpochNumber(0);

  // l1GenesisTime 0, slotDuration 8, epochDuration 16 → 128s/epoch, so epochStart(E) = E * 128.
  const l1Constants: L1RollupConstants = {
    l1StartBlock: 0n,
    l1GenesisTime: 0n,
    slotDuration: 8,
    epochDuration: 16,
    ethereumSlotDuration: 4,
    proofSubmissionEpochs: 2,
    targetCommitteeSize: 48,
    rollupManaLimit: Number.MAX_SAFE_INTEGER,
  };

  function makeCtx(opts: {
    attesterCount?: () => Promise<number>;
    blockNumber?: BlockNumber;
    attesterCountAtTime?: (ts: bigint) => Promise<number>;
    nowSeconds?: number;
    lag?: number;
  }) {
    const logger = { info: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    const ctx: MissingCommitteeContext = {
      epochCache: {
        getL1Constants: () => l1Constants,
        getLagInEpochsForValidatorSet: () => opts.lag ?? 2,
      },
      rollupContract: {
        getActiveAttesterCount: opts.attesterCount ?? (() => Promise.resolve(0)),
        getAttesterCountAtTime: opts.attesterCountAtTime ?? (() => Promise.resolve(0)),
      },
      l2BlockSource: {
        getBlockNumber: () => Promise.resolve(opts.blockNumber ?? BlockNumber.ZERO),
      },
      l1Constants,
      dateProvider: { nowInSeconds: () => opts.nowSeconds ?? 10 },
      logger,
    };
    return { ctx, logger };
  }

  it('logs a gentle info while bootstrapping with too few validators and no blocks yet', async () => {
    const { ctx, logger } = makeCtx({ attesterCount: () => Promise.resolve(0), blockNumber: BlockNumber.ZERO });

    await logMissingCommittee(targetSlot, targetEpoch, ctx);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('has not started producing blocks'),
      expect.objectContaining({ cause: 'awaiting-first-validators', attesterCount: 0, targetCommitteeSize: 48 }),
    );
  });

  it('warns when the validator set has shrunk on a live chain', async () => {
    const { ctx, logger } = makeCtx({ attesterCount: () => Promise.resolve(10), blockNumber: BlockNumber(100) });

    await logMissingCommittee(targetSlot, targetEpoch, ctx);

    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('validator set has dropped'),
      expect.objectContaining({ cause: 'validator-set-shrank', attesterCount: 10 }),
    );
  });

  it('estimates a fixed earlier epoch by replaying the validator-set sampling rule', async () => {
    // Committee for epoch E samples at epochStart(E) - 2 epochs. The set is below target at epoch 1's sample
    // time but full by epoch 2's (== genesis here), so the first committee lands at epoch 2 — earlier than the
    // pessimistic epoch 3 (targetEpoch + lag + 1) bound.
    const { ctx, logger } = makeCtx({
      attesterCount: () => Promise.resolve(3462),
      blockNumber: BlockNumber.ZERO,
      attesterCountAtTime: (ts: bigint) => Promise.resolve(ts >= 0n ? 3462 : 10),
      nowSeconds: 10,
    });

    await logMissingCommittee(targetSlot, targetEpoch, ctx);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('first committee is expected at epoch 2'),
      expect.objectContaining({ cause: 'awaiting-sampling-lag', firstCommitteeEpoch: EpochNumber(2) }),
    );
  });

  it('reports a bounded epoch when the sampling-time reads fail', async () => {
    const { ctx, logger } = makeCtx({
      attesterCount: () => Promise.resolve(3462),
      blockNumber: BlockNumber.ZERO,
      attesterCountAtTime: () => Promise.reject(new Error('gse down')),
      nowSeconds: 10,
    });

    await logMissingCommittee(targetSlot, targetEpoch, ctx);

    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('no later than epoch 3'),
      expect.objectContaining({ cause: 'awaiting-sampling-lag', firstCommitteeEpoch: EpochNumber(3) }),
    );
  });

  it('falls back to a neutral warning when the attester count query fails', async () => {
    const { ctx, logger } = makeCtx({ attesterCount: () => Promise.reject(new Error('rpc down')) });

    await logMissingCommittee(targetSlot, targetEpoch, ctx);

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('could not determine validator set size'),
      expect.objectContaining({ targetSlot, targetEpoch }),
    );
  });
});
