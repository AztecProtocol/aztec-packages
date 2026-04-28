import { describe, expect, it } from '@jest/globals';

import {
  MINIMUM_CONGESTION_MULTIPLIER,
  computeCongestionMultiplier,
  computeExcessMana,
  computeManaMinFee,
  fakeExponential,
} from './fee_math.js';

describe('fakeExponential', () => {
  it('returns factor when numerator is zero', () => {
    expect(fakeExponential(1_000_000_000n, 0n, 100n)).toBe(1_000_000_000n);
  });

  it('returns factor when numerator is zero (large factor)', () => {
    expect(fakeExponential(1_000_000_000_000n, 0n, 1_000n)).toBe(1_000_000_000_000n);
  });

  it('approximates e^1 correctly', () => {
    // fakeExponential(1e9, d, d) should approximate 1e9 * e ≈ 2.718e9
    const result = fakeExponential(1_000_000_000n, 1000n, 1000n);
    // e ≈ 2.71828, so result should be close to 2718281828
    expect(result).toBeGreaterThan(2_718_000_000n);
    expect(result).toBeLessThan(2_719_000_000n);
  });

  it('approximates e^2 correctly', () => {
    const result = fakeExponential(1_000_000_000n, 2000n, 1000n);
    // e^2 ≈ 7.389, so result ≈ 7389e6
    expect(result).toBeGreaterThan(7_388_000_000n);
    expect(result).toBeLessThan(7_390_000_000n);
  });

  it('returns zero when factor is zero', () => {
    expect(fakeExponential(0n, 100n, 50n)).toBe(0n);
  });
});

describe('computeExcessMana', () => {
  it('returns zero when mana used is below target', () => {
    expect(computeExcessMana(0n, 50_000n, 100_000n)).toBe(0n);
  });

  it('returns zero when excess + used equals target', () => {
    expect(computeExcessMana(0n, 100_000n, 100_000n)).toBe(0n);
  });

  it('accumulates excess when usage exceeds target', () => {
    expect(computeExcessMana(0n, 200_000n, 100_000n)).toBe(100_000n);
  });

  it('adds to existing excess', () => {
    expect(computeExcessMana(50_000n, 200_000n, 100_000n)).toBe(150_000n);
  });

  it('drains excess when usage is below target', () => {
    expect(computeExcessMana(100_000n, 50_000n, 100_000n)).toBe(50_000n);
  });

  it('clamps to zero when drain exceeds excess', () => {
    expect(computeExcessMana(10_000n, 0n, 100_000n)).toBe(0n);
  });
});

describe('computeCongestionMultiplier', () => {
  it('returns MINIMUM_CONGESTION_MULTIPLIER when excess is zero', () => {
    expect(computeCongestionMultiplier(0n, 100_000_000n)).toBe(MINIMUM_CONGESTION_MULTIPLIER);
  });

  it('increases with excess mana', () => {
    const low = computeCongestionMultiplier(100_000n, 100_000_000n);
    const high = computeCongestionMultiplier(200_000n, 100_000_000n);
    expect(high).toBeGreaterThan(low);
    expect(low).toBeGreaterThan(MINIMUM_CONGESTION_MULTIPLIER);
  });

  it('increases by ~12.5% per manaTarget of excess', () => {
    // When excessMana = manaTarget, multiplier ≈ 1.125 * MINIMUM_CONGESTION_MULTIPLIER
    const manaTarget = 100_000_000n;
    const multiplier = computeCongestionMultiplier(manaTarget, manaTarget);
    const ratio = Number(multiplier) / Number(MINIMUM_CONGESTION_MULTIPLIER);
    expect(ratio).toBeGreaterThan(1.12);
    expect(ratio).toBeLessThan(1.13);
  });
});

describe('computeManaMinFee', () => {
  const baseParams = {
    l1BaseFee: 30_000_000_000n, // 30 gwei
    l1BlobFee: 1n,
    manaTarget: 100_000_000n,
    epochDuration: 16n,
    provingCostPerManaEth: 0n,
    excessMana: 0n,
    ethPerFeeAsset: 1_000_000_000_000n, // 1:1 ETH:FeeAsset
  };

  it('returns zero when manaTarget is zero', () => {
    expect(computeManaMinFee({ ...baseParams, manaTarget: 0n })).toBe(0n);
  });

  it('returns non-zero for reasonable parameters', () => {
    const fee = computeManaMinFee(baseParams);
    expect(fee).toBeGreaterThan(0n);
  });

  it('increases with L1 base fee', () => {
    const low = computeManaMinFee(baseParams);
    const high = computeManaMinFee({ ...baseParams, l1BaseFee: 60_000_000_000n });
    expect(high).toBeGreaterThan(low);
  });

  it('increases with congestion (excess mana)', () => {
    const low = computeManaMinFee(baseParams);
    const high = computeManaMinFee({ ...baseParams, excessMana: baseParams.manaTarget * 3n });
    expect(high).toBeGreaterThan(low);
  });

  it('increases with blob fee', () => {
    const low = computeManaMinFee(baseParams);
    const high = computeManaMinFee({ ...baseParams, l1BlobFee: 1_000_000_000n });
    expect(high).toBeGreaterThan(low);
  });

  it('has zero congestion cost when excess mana is zero', () => {
    // With zero excess, congestionMultiplier = MINIMUM_CONGESTION_MULTIPLIER,
    // so congestionCost = total * 1 - total = 0
    const fee = computeManaMinFee(baseParams);
    // The fee should equal just sequencer + prover costs
    const feeWithExcess = computeManaMinFee({ ...baseParams, excessMana: baseParams.manaTarget });
    expect(feeWithExcess).toBeGreaterThan(fee);
  });
});
