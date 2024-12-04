// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {SignedMath} from "@oz/utils/math/SignedMath.sol";

import {Errors} from "../Errors.sol";

// These values are taken from the model, but mostly pulled out of the ass
uint256 constant MINIMUM_PROVING_COST_PER_MANA = 5415357955;
uint256 constant MAX_PROVING_COST_MODIFIER = 1000000000;
uint256 constant PROVING_UPDATE_FRACTION = 100000000000;

uint256 constant MINIMUM_FEE_ASSET_PRICE = 10000000000;
uint256 constant MAX_FEE_ASSET_PRICE_MODIFIER = 1000000000;
uint256 constant FEE_ASSET_PRICE_UPDATE_FRACTION = 100000000000;

uint256 constant L1_GAS_PER_BLOCK_PROPOSED = 150000;
uint256 constant L1_GAS_PER_EPOCH_VERIFIED = 1000000;

uint256 constant MINIMUM_CONGESTION_MULTIPLIER = 1000000000;
uint256 constant MANA_TARGET = 100000000;
uint256 constant CONGESTION_UPDATE_FRACTION = 854700854;

uint256 constant BLOB_GAS_PER_BLOB = 2 ** 17;
uint256 constant GAS_PER_BLOB_POINT_EVALUATION = 50_000;

struct OracleInput {
  int256 provingCostModifier;
  int256 feeAssetPriceModifier;
}

struct ManaBaseFeeComponents {
  uint256 congestionCost;
  uint256 congestionMultiplier;
  uint256 dataCost;
  uint256 gasCost;
  uint256 provingCost;
}

struct FeeHeader {
  uint256 excessMana;
  uint256 feeAssetPriceNumerator;
  uint256 manaUsed;
  uint256 provingCostPerManaNumerator;
  uint256 congestionCost;
}

struct L1FeeData {
  uint256 baseFee;
  uint256 blobFee;
}

library FeeMath {
  using Math for uint256;
  using SafeCast for int256;
  using SafeCast for uint256;
  using SignedMath for int256;

  function getManaBaseFeeComponentsAt(
    FeeHeader storage _parentFeeHeader,
    L1FeeData memory _fees,
    uint256 _feeAssetPrice,
    uint256 _epochDuration
  ) internal view returns (ManaBaseFeeComponents memory) {
    uint256 excessMana = FeeMath.clampedAdd(
      _parentFeeHeader.excessMana + _parentFeeHeader.manaUsed, -int256(MANA_TARGET)
    );

    uint256 dataCost =
      Math.mulDiv(3 * BLOB_GAS_PER_BLOB, _fees.blobFee, MANA_TARGET, Math.Rounding.Ceil);
    uint256 gasUsed = L1_GAS_PER_BLOCK_PROPOSED + 3 * GAS_PER_BLOB_POINT_EVALUATION
      + L1_GAS_PER_EPOCH_VERIFIED / _epochDuration;
    uint256 gasCost = Math.mulDiv(gasUsed, _fees.baseFee, MANA_TARGET, Math.Rounding.Ceil);
    uint256 provingCost = FeeMath.provingCostPerMana(_parentFeeHeader.provingCostPerManaNumerator);

    uint256 congestionMultiplier_ = congestionMultiplier(excessMana);
    uint256 total = dataCost + gasCost + provingCost;
    uint256 congestionCost = Math.mulDiv(
      total, congestionMultiplier_, MINIMUM_CONGESTION_MULTIPLIER, Math.Rounding.Floor
    ) - total;

    // @todo @lherskind. The following is a crime against humanity, but it makes it
    // very neat to plot etc from python, #10004 will fix it across the board
    return ManaBaseFeeComponents({
      dataCost: Math.mulDiv(dataCost, _feeAssetPrice, 1e9, Math.Rounding.Ceil),
      gasCost: Math.mulDiv(gasCost, _feeAssetPrice, 1e9, Math.Rounding.Ceil),
      provingCost: Math.mulDiv(provingCost, _feeAssetPrice, 1e9, Math.Rounding.Ceil),
      congestionCost: Math.mulDiv(congestionCost, _feeAssetPrice, 1e9, Math.Rounding.Ceil),
      congestionMultiplier: congestionMultiplier_
    });
  }

  function assertValid(OracleInput memory _self) internal pure returns (bool) {
    require(
      SignedMath.abs(_self.provingCostModifier) <= MAX_PROVING_COST_MODIFIER,
      Errors.FeeMath__InvalidProvingCostModifier()
    );
    require(
      SignedMath.abs(_self.feeAssetPriceModifier) <= MAX_FEE_ASSET_PRICE_MODIFIER,
      Errors.FeeMath__InvalidFeeAssetPriceModifier()
    );
    return true;
  }

  /**
   * @notice  Clamps the addition of a signed integer to a uint256
   *          Useful for running values, whose minimum value will be 0
   *          but should not throw if going below.
   * @param _a The base value
   * @param _b The value to add
   * @return The clamped value
   */
  function clampedAdd(uint256 _a, int256 _b) internal pure returns (uint256) {
    if (_b >= 0) {
      return _a + _b.toUint256();
    }

    uint256 sub = SignedMath.abs(_b);

    if (_a > sub) {
      return _a - sub;
    }

    return 0;
  }

  function provingCostPerMana(uint256 _numerator) internal pure returns (uint256) {
    return fakeExponential(MINIMUM_PROVING_COST_PER_MANA, _numerator, PROVING_UPDATE_FRACTION);
  }

  function feeAssetPriceModifier(uint256 _numerator) internal pure returns (uint256) {
    return fakeExponential(MINIMUM_FEE_ASSET_PRICE, _numerator, FEE_ASSET_PRICE_UPDATE_FRACTION);
  }

  function congestionMultiplier(uint256 _numerator) internal pure returns (uint256) {
    return fakeExponential(MINIMUM_CONGESTION_MULTIPLIER, _numerator, CONGESTION_UPDATE_FRACTION);
  }

  function summedBaseFee(ManaBaseFeeComponents memory _components) internal pure returns (uint256) {
    return _components.dataCost + _components.gasCost + _components.provingCost
      + _components.congestionCost;
  }

  /**
   * @notice An approximation of the exponential function: factor * e ** (numerator / denominator)
   *
   *         The function is the same as used in EIP-4844
   *         https://github.com/ethereum/EIPs/blob/master/EIPS/eip-4844.md
   *
   *         Approximated using a taylor series.
   *         For shorthand below, let `a = factor`, `x = numerator`, `d = denominator`
   *
   *         f(x) =  a
   *              + (a * x) / d
   *              + (a * x ** 2) / (2 * d ** 2)
   *              + (a * x ** 3) / (6 * d ** 3)
   *              + (a * x ** 4) / (24 * d ** 4)
   *              + (a * x ** 5) / (120 * d ** 5)
   *              + ...
   *
   *         For integer precision purposes, we will multiply by the denominator for intermediary steps and then
   *         finally do a division by it.
   *         The notation below might look slightly strange, but it is to try to convey the program flow below.
   *
   *         e(x) = (          a * d
   *                 +         a * d * x / d
   *                 +       ((a * d * x / d) * x) / (2 * d)
   *                 +     ((((a * d * x / d) * x) / (2 * d)) * x) / (3 * d)
   *                 +   ((((((a * d * x / d) * x) / (2 * d)) * x) / (3 * d)) * x) / (4 * d)
   *                 + ((((((((a * d * x / d) * x) / (2 * d)) * x) / (3 * d)) * x) / (4 * d)) * x) / (5 * d)
   *                 + ...
   *                 ) / d
   *
   *         The notation might make it a bit of a pain to look at, but f(x) and e(x) are the same.
   *         Gotta love integer math.
   *
   * @dev   Notice that as _numerator grows, the computation will quickly overflow.
   *        As long as the `_denominator` is fairly small, it won't bring us back down to not overflow
   *        For our purposes, this is acceptable, as if we have a fee that is so high that it would overflow and throw
   *        then we would have other problems.
   *
   * @param _factor The base value
   * @param _numerator The numerator
   * @param _denominator The denominator
   * @return The approximated value `_factor * e ** (_numerator / _denominator)`
   */
  function fakeExponential(uint256 _factor, uint256 _numerator, uint256 _denominator)
    private
    pure
    returns (uint256)
  {
    uint256 i = 1;
    uint256 output = 0;
    uint256 numeratorAccumulator = _factor * _denominator;
    while (numeratorAccumulator > 0) {
      output += numeratorAccumulator;
      numeratorAccumulator = (numeratorAccumulator * _numerator) / (_denominator * i);
      i += 1;
    }
    return output / _denominator;
  }
}
