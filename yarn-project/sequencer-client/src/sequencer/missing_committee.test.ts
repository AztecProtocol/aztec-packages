import { EpochNumber } from '@aztec/foundation/branded-types';

import { classifyMissingCommittee } from './missing_committee.js';

describe('classifyMissingCommittee', () => {
  const base = {
    targetCommitteeSize: 48,
    currentEpoch: EpochNumber(600),
    lagInEpochsForValidatorSet: 2,
    hasProducedBlocks: false,
  };

  it('reports awaiting-first-validators while bootstrapping with too few validators', () => {
    const result = classifyMissingCommittee({ ...base, attesterCount: 0, hasProducedBlocks: false });
    expect(result).toEqual({ cause: 'awaiting-first-validators', severity: 'info' });
  });

  it('still awaits first validators when partially filled and no blocks produced yet', () => {
    const result = classifyMissingCommittee({ ...base, attesterCount: 47, hasProducedBlocks: false });
    expect(result.cause).toBe('awaiting-first-validators');
    expect(result.severity).toBe('info');
  });

  it('warns about a shrunken validator set once the chain has produced blocks', () => {
    const result = classifyMissingCommittee({ ...base, attesterCount: 10, hasProducedBlocks: true });
    expect(result).toEqual({ cause: 'validator-set-shrank', severity: 'warn' });
  });

  it('reports awaiting-sampling-lag with an expected epoch once enough validators are staked', () => {
    const result = classifyMissingCommittee({ ...base, attesterCount: 48, hasProducedBlocks: false });
    expect(result).toEqual({
      cause: 'awaiting-sampling-lag',
      severity: 'info',
      expectedByEpoch: EpochNumber(603),
    });
  });

  it('prefers the sampling-lag cause over shrink even after blocks were produced', () => {
    const result = classifyMissingCommittee({ ...base, attesterCount: 3462, hasProducedBlocks: true });
    expect(result.cause).toBe('awaiting-sampling-lag');
    expect(result.expectedByEpoch).toEqual(EpochNumber(603));
  });
});
