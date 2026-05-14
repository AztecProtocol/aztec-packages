import { BlockNumber, CheckpointNumber } from '@aztec/foundation/branded-types';

import { clampL2TipNumbers, isL2TipsOrdered } from './l2_block_source.js';

const BN = BlockNumber;
const CN = CheckpointNumber;

describe('clampL2TipNumbers', () => {
  it('returns same object reference when already ordered', () => {
    const input = {
      proposed: BN(10),
      proposedCheckpoint: BN(8),
      checkpointed: BN(6),
      proven: BN(4),
      finalized: BN(2),
    };
    const result = clampL2TipNumbers(input);
    expect(result).toBe(input);
  });

  it('clamps proven to checkpointed when proven > checkpointed', () => {
    const result = clampL2TipNumbers({
      proposed: BN(10),
      proposedCheckpoint: BN(8),
      checkpointed: BN(6),
      proven: BN(8),
      finalized: BN(2),
    });
    expect(result.proven).toBe(6);
    expect(result.checkpointed).toBe(6);
    expect(result.proposedCheckpoint).toBe(8);
    expect(result.proposed).toBe(10);
    expect(result.finalized).toBe(2);
  });

  it('clamps finalized to proven when finalized > proven', () => {
    const result = clampL2TipNumbers({
      proposed: BN(10),
      proposedCheckpoint: BN(8),
      checkpointed: BN(6),
      proven: BN(4),
      finalized: BN(6),
    });
    expect(result.finalized).toBe(4);
    expect(result.proven).toBe(4);
    expect(result.checkpointed).toBe(6);
  });

  it('cascades violations top-down', () => {
    const result = clampL2TipNumbers({
      proposed: BN(5),
      proposedCheckpoint: BN(8),
      checkpointed: BN(10),
      proven: BN(12),
      finalized: BN(14),
    });
    expect(result.proposed).toBe(5);
    expect(result.proposedCheckpoint).toBe(5);
    expect(result.checkpointed).toBe(5);
    expect(result.proven).toBe(5);
    expect(result.finalized).toBe(5);
  });

  it('clamps only top field when only proposedCheckpoint > proposed', () => {
    const result = clampL2TipNumbers({
      proposed: BN(5),
      proposedCheckpoint: BN(7),
      checkpointed: BN(4),
      proven: BN(3),
      finalized: BN(2),
    });
    expect(result.proposedCheckpoint).toBe(5);
    expect(result.checkpointed).toBe(4);
    expect(result.proven).toBe(3);
    expect(result.finalized).toBe(2);
  });

  it('does not modify hashes on equal block numbers (hash divergence is a no-op)', () => {
    const input = {
      proposed: BN(5),
      proposedCheckpoint: BN(5),
      checkpointed: BN(5),
      proven: BN(5),
      finalized: BN(5),
    };
    const result = clampL2TipNumbers(input);
    expect(result).toBe(input);
  });
});

describe('isL2TipsOrdered', () => {
  const tip = (block: number, checkpoint?: number) => ({
    block: { number: BN(block) },
    ...(checkpoint !== undefined ? { checkpoint: { number: CN(checkpoint) } } : {}),
  });

  it('returns true for ordered block numbers', () => {
    expect(
      isL2TipsOrdered({
        proposed: { number: BN(10) },
        proposedCheckpoint: tip(8),
        checkpointed: tip(6),
        proven: tip(4),
        finalized: tip(2),
      }),
    ).toBe(true);
  });

  it('returns false when block numbers violate ordering', () => {
    expect(
      isL2TipsOrdered({
        proposed: { number: BN(5) },
        proposedCheckpoint: tip(8),
        checkpointed: tip(6),
        proven: tip(4),
        finalized: tip(2),
      }),
    ).toBe(false);
  });

  it('returns true when a tip is omitted (e.g. ChainTips omits proposedCheckpoint)', () => {
    expect(
      isL2TipsOrdered({
        proposed: { number: BN(10) },
        checkpointed: tip(6),
        proven: tip(4),
        finalized: tip(2),
      }),
    ).toBe(true);
  });

  it('returns true for ordered checkpoint numbers', () => {
    expect(
      isL2TipsOrdered({
        proposed: { number: BN(10) },
        proposedCheckpoint: tip(8, 4),
        checkpointed: tip(6, 3),
        proven: tip(4, 2),
        finalized: tip(2, 1),
      }),
    ).toBe(true);
  });

  it('returns false when checkpoint numbers violate ordering', () => {
    expect(
      isL2TipsOrdered({
        proposed: { number: BN(10) },
        proposedCheckpoint: tip(8, 4),
        checkpointed: tip(6, 3),
        proven: tip(4, 5),
        finalized: tip(2, 1),
      }),
    ).toBe(false);
  });

  it('ignores missing checkpoint fields and only checks present ones', () => {
    // proven has no checkpoint; finalized does. Checkpoint ordering still validates among present ones.
    expect(
      isL2TipsOrdered({
        proposed: { number: BN(10) },
        checkpointed: tip(6, 3),
        proven: tip(4),
        finalized: tip(2, 1),
      }),
    ).toBe(true);
  });
});
