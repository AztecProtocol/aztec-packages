import {
  MAX_FEE_ASSET_PRICE_MODIFIER_BPS,
  sqrtPriceX96ToEthPerFeeAssetE12,
  validateFeeAssetPriceModifier,
} from './fee_asset_price_oracle.js';

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
