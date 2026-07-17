import { EpochNumber } from '@aztec/foundation/branded-types';

import { classifyMissingCommittee, findFirstEpochWithCommittee } from './missing_committee.js';

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
  const fallbackEpoch = EpochNumber(603);

  it('returns the first past epoch whose sample already met the target', () => {
    const result = findFirstEpochWithCommittee({
      candidates: [
        { epoch: EpochNumber(601), sampledAttesterCount: 10 },
        { epoch: EpochNumber(602), sampledAttesterCount: 48 },
        { epoch: EpochNumber(603), sampledAttesterCount: undefined },
      ],
      targetCommitteeSize,
      fallbackEpoch,
    });
    expect(result).toEqual({ epoch: EpochNumber(602), provenance: 'historical' });
  });

  it('projects the first future-sampled epoch when no past sample qualifies', () => {
    const result = findFirstEpochWithCommittee({
      candidates: [
        { epoch: EpochNumber(601), sampledAttesterCount: 10 },
        { epoch: EpochNumber(602), sampledAttesterCount: undefined },
        { epoch: EpochNumber(603), sampledAttesterCount: undefined },
      ],
      targetCommitteeSize,
      fallbackEpoch,
    });
    expect(result).toEqual({ epoch: EpochNumber(602), provenance: 'projected-future' });
  });

  it('prefers a qualifying past epoch over an earlier future-sampled one only when it comes first', () => {
    // The scan is ascending: a future sample time (undefined) that precedes a qualifying past sample wins,
    // since the predicate is not monotone and the earliest qualifying epoch is the answer.
    const result = findFirstEpochWithCommittee({
      candidates: [
        { epoch: EpochNumber(601), sampledAttesterCount: undefined },
        { epoch: EpochNumber(602), sampledAttesterCount: 50 },
      ],
      targetCommitteeSize,
      fallbackEpoch,
    });
    expect(result).toEqual({ epoch: EpochNumber(601), provenance: 'projected-future' });
  });

  it('falls back to the upper-bound epoch when nothing qualifies', () => {
    const result = findFirstEpochWithCommittee({
      candidates: [
        { epoch: EpochNumber(601), sampledAttesterCount: 10 },
        { epoch: EpochNumber(602), sampledAttesterCount: 20 },
      ],
      targetCommitteeSize,
      fallbackEpoch,
    });
    expect(result).toEqual({ epoch: fallbackEpoch, provenance: 'fallback' });
  });
});
