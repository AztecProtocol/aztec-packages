import { type L1RollupConstants, getProofSubmissionDeadlineTimestamp, getTimestampRangeForEpoch } from './index.js';

describe('EpochHelpers', () => {
  let constants: Omit<L1RollupConstants, 'l1StartBlock'>;
  const l1GenesisTime = 1734440000n;

  beforeEach(() => {
    constants = {
      l1GenesisTime: l1GenesisTime,
      epochDuration: 4,
      slotDuration: 24,
      ethereumSlotDuration: 12,
      proofSubmissionEpochs: 1,
    };
  });

  it('returns timestamp range for initial epoch', () => {
    const [start, end] = getTimestampRangeForEpoch(0n, constants);
    expect(start).toEqual(l1GenesisTime);
    expect(end).toEqual(l1GenesisTime + BigInt(24 * 3 + 12));
  });

  it('returns timestamp range for second epoch', () => {
    const [start, end] = getTimestampRangeForEpoch(1n, constants);
    expect(start).toEqual(l1GenesisTime + BigInt(24 * 4));
    expect(end).toEqual(l1GenesisTime + BigInt(24 * 4) + BigInt(24 * 3 + 12));
  });

  it('returns proof submission deadline', () => {
    const deadline = getProofSubmissionDeadlineTimestamp(3n, constants);
    expect(deadline).toEqual(l1GenesisTime + BigInt(24 * 4 * 3) + BigInt(24 * 8));
  });
});
