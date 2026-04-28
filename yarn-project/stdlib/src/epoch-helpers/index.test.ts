import { EpochNumber, SlotNumber } from '@aztec/foundation/branded-types';

import {
  type L1RollupConstants,
  computeQuorum,
  getLastL1SlotTimestampForL2Slot,
  getProofSubmissionDeadlineTimestamp,
  getTimestampRangeForEpoch,
} from './index.js';

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
      targetCommitteeSize: 48,
      rollupManaLimit: Number.MAX_SAFE_INTEGER,
    };
  });

  it('returns timestamp range for initial epoch', () => {
    const [start, end] = getTimestampRangeForEpoch(EpochNumber.fromBigInt(0n), constants);
    expect(start).toEqual(l1GenesisTime);
    expect(end).toEqual(l1GenesisTime + BigInt(24 * 3 + 12));
  });

  it('returns timestamp range for second epoch', () => {
    const [start, end] = getTimestampRangeForEpoch(EpochNumber.fromBigInt(1n), constants);
    expect(start).toEqual(l1GenesisTime + BigInt(24 * 4));
    expect(end).toEqual(l1GenesisTime + BigInt(24 * 4) + BigInt(24 * 3 + 12));
  });

  it('returns proof submission deadline', () => {
    const deadline = getProofSubmissionDeadlineTimestamp(EpochNumber.fromBigInt(3n), constants);
    expect(deadline).toEqual(l1GenesisTime + BigInt(24 * 4 * 3) + BigInt(24 * 8));
  });

  it('returns last L1 slot timestamp for L2 slot', () => {
    // L2 slot 0 starts at l1GenesisTime, lasts 24s with 12s L1 slots, so last L1 slot is at +12
    const ts = getLastL1SlotTimestampForL2Slot(SlotNumber(0), constants);
    expect(ts).toEqual(l1GenesisTime + BigInt(24 - 12));

    // L2 slot 5 starts at l1GenesisTime + 5*24 = +120, last L1 slot at +120+12 = +132
    const ts2 = getLastL1SlotTimestampForL2Slot(SlotNumber(5), constants);
    expect(ts2).toEqual(l1GenesisTime + BigInt(5 * 24 + 24 - 12));
  });

  describe('computeQuorum', () => {
    it('returns 1 for committee size 0', () => {
      expect(computeQuorum(0)).toBe(1);
    });

    it('returns 1 for committee size 1', () => {
      expect(computeQuorum(1)).toBe(1);
    });

    it('returns 2 for committee size 2', () => {
      expect(computeQuorum(2)).toBe(2);
    });

    it('returns 3 for committee size 3', () => {
      expect(computeQuorum(3)).toBe(3);
    });

    it('returns 3 for committee size 4', () => {
      expect(computeQuorum(4)).toBe(3);
    });

    it('returns 33 for committee size 48', () => {
      expect(computeQuorum(48)).toBe(33);
    });
  });
});
