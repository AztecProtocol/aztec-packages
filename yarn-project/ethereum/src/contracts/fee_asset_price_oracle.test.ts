import { jest } from '@jest/globals';
import { type MockProxy, mock } from 'jest-mock-extended';

import type { ViemClient } from '../types.js';
import {
  FeeAssetPriceOracle,
  MAX_FEE_ASSET_PRICE_MODIFIER_BPS,
  sqrtPriceX96ToEthPerFeeAssetE12,
  validateFeeAssetPriceModifier,
} from './fee_asset_price_oracle.js';
import { RollupContract } from './rollup.js';

describe('Uniswap Price Oracle', () => {
  describe('sqrtPriceX96ToEthPerFeeAssetE12', () => {
    it('converts 1:1 rate correctly', () => {
      // If 1 fee asset = 1 ETH, then feeAssetPerEth = 1
      // sqrtPriceX96 = sqrt(1) * 2^96 = 2^96
      const Q96 = 2n ** 96n;
      const ethPerFeeAssetE12 = sqrtPriceX96ToEthPerFeeAssetE12(Q96);
      // ethPerFeeAsset = 1, scaled by 1e12
      expect(ethPerFeeAssetE12).toBe(10n ** 12n);
    });

    it('converts typical exchange rate correctly', () => {
      // If 1000 fee asset = 1 ETH, then feeAssetPerEth = 1000
      // sqrtPriceX96 = sqrt(1000) * 2^96
      // ethPerFeeAsset = 0.001 (scaled by 1e12 = 1e9)
      const sqrt1000 = 31622776601683793319n; // sqrt(1000) * 1e18
      const sqrtPriceX96 = (sqrt1000 * 2n ** 96n) / 10n ** 18n;

      const ethPerFeeAssetE12 = sqrtPriceX96ToEthPerFeeAssetE12(sqrtPriceX96);

      const expectedEthPerFeeAssetE12 = 10n ** 9n;
      const tolerance = expectedEthPerFeeAssetE12 / 100n; // 1% tolerance

      expect(ethPerFeeAssetE12).toBeGreaterThan(expectedEthPerFeeAssetE12 - tolerance);
      expect(ethPerFeeAssetE12).toBeLessThan(expectedEthPerFeeAssetE12 + tolerance);
    });

    it('handles very high fee asset prices (few fee assets per ETH)', () => {
      // If 0.1 fee asset = 1 ETH (fee asset is very valuable)
      // feeAssetPerEth = 0.1, sqrtPriceX96 = sqrt(0.1) * 2^96
      // ethPerFeeAsset = 10 (scaled by 1e12 = 10e12)
      const sqrt01 = 316227766016837933n; // sqrt(0.1) * 1e18
      const sqrtPriceX96 = (sqrt01 * 2n ** 96n) / 10n ** 18n;

      const ethPerFeeAssetE12 = sqrtPriceX96ToEthPerFeeAssetE12(sqrtPriceX96);

      const expectedEthPerFeeAssetE12 = 10n * 10n ** 12n;
      const tolerance = expectedEthPerFeeAssetE12 / 100n; // 1% tolerance

      expect(ethPerFeeAssetE12).toBeGreaterThan(expectedEthPerFeeAssetE12 - tolerance);
      expect(ethPerFeeAssetE12).toBeLessThan(expectedEthPerFeeAssetE12 + tolerance);
    });

    it('throws when input is 0', () => {
      expect(() => sqrtPriceX96ToEthPerFeeAssetE12(0n)).toThrow('Cannot convert zero sqrtPriceX96');
    });
  });

  describe('computePriceModifier', () => {
    let client: MockProxy<ViemClient>;
    let rollupContract: MockProxy<RollupContract>;
    let oracle: FeeAssetPriceOracle;
    const oraclePriceE12 = 10n ** 7n;

    beforeEach(() => {
      client = mock<ViemClient>();
      rollupContract = mock<RollupContract>();
      oracle = new FeeAssetPriceOracle(client, rollupContract);

      // Inject a stub uniswap oracle so we can drive the oracle price without touching the
      // real Uniswap V4 StateView contract.
      jest.spyOn(oracle, 'getUniswapOracle').mockResolvedValue({
        getMeanEthPerFeeAssetE12: () => Promise.resolve(oraclePriceE12),
      } as never);
    });

    it('reads ethPerFeeAsset from L1 when no predicted price is provided', async () => {
      const onChainPriceE12 = 9_950_000n;
      rollupContract.getEthPerFeeAsset.mockResolvedValue(onChainPriceE12);

      const modifier = await oracle.computePriceModifier();

      expect(rollupContract.getEthPerFeeAsset).toHaveBeenCalledTimes(1);
      expect(modifier).toBe(oracle.computePriceModifierBps(onChainPriceE12, oraclePriceE12));
    });

    it('uses the supplied predicted price and skips the L1 read when provided', async () => {
      const predictedPriceE12 = 10_050_000n;
      const modifier = await oracle.computePriceModifier(predictedPriceE12);

      expect(rollupContract.getEthPerFeeAsset).not.toHaveBeenCalled();
      expect(modifier).toBe(oracle.computePriceModifierBps(predictedPriceE12, oraclePriceE12));
    });

    it('emits the modifier that drives the predicted parent toward (but not exactly to) the target', async () => {
      // Pick a target within the ±100 bps cap so the test exercises truncation rather than the clamp.
      // P=10_100_000, T=10_150_000:
      //   raw bps = floor((T - P) * 10_000 / P) = floor(50_000 * 10_000 / 10_100_000) = 49
      //   child  = floor(P * (10_000 + 49) / 10_000) = 10_149_490
      // Note 10_149_490 != 10_150_000 — bps truncation leaves the child ~510 LSB (~0.5 bp) shy
      // of the target. The e2e test depends on this sub-bp gap: convergence is monotonic and
      // within sub-bp of target, not exact equality.
      const predictedParentE12 = 10_100_000n;
      const targetE12 = 10_150_000n;
      jest.spyOn(oracle, 'getUniswapOracle').mockResolvedValue({
        getMeanEthPerFeeAssetE12: () => Promise.resolve(targetE12),
      } as never);

      const modifier = await oracle.computePriceModifier(predictedParentE12);
      expect(modifier).toBe(49n);

      const child = RollupContract.computeChildFeeHeader(
        { excessMana: 0n, manaUsed: 0n, ethPerFeeAsset: predictedParentE12, congestionCost: 0n, proverCost: 0n },
        0n,
        modifier,
        100n,
      );
      expect(child.ethPerFeeAsset).toBe(10_149_490n);
      expect(child.ethPerFeeAsset).not.toBe(targetE12);
    });
  });

  describe('validateFeeAssetPriceModifier', () => {
    it('accepts 0 modifier', () => {
      expect(validateFeeAssetPriceModifier(0n)).toBe(true);
    });

    it('accepts positive modifier within range', () => {
      expect(validateFeeAssetPriceModifier(50n)).toBe(true);
      expect(validateFeeAssetPriceModifier(MAX_FEE_ASSET_PRICE_MODIFIER_BPS)).toBe(true);
    });

    it('accepts negative modifier within range', () => {
      expect(validateFeeAssetPriceModifier(-50n)).toBe(true);
      expect(validateFeeAssetPriceModifier(-MAX_FEE_ASSET_PRICE_MODIFIER_BPS)).toBe(true);
    });

    it('rejects modifier above max', () => {
      expect(validateFeeAssetPriceModifier(MAX_FEE_ASSET_PRICE_MODIFIER_BPS + 1n)).toBe(false);
      expect(validateFeeAssetPriceModifier(1000n)).toBe(false);
    });

    it('rejects modifier below min', () => {
      expect(validateFeeAssetPriceModifier(-MAX_FEE_ASSET_PRICE_MODIFIER_BPS - 1n)).toBe(false);
      expect(validateFeeAssetPriceModifier(-1000n)).toBe(false);
    });
  });
});
