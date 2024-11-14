// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {SignedMath} from "@oz/utils/math/SignedMath.sol";

import {Errors} from "./Errors.sol";

struct OracleInput {
  int256 provingCostModifier;
  int256 feeAssetPriceModifier;
}

library FeeMath {
  using Math for uint256;
  using SafeCast for int256;
  using SafeCast for uint256;
  using SignedMath for int256;

  // These values are taken from the model, but mostly pulled out of the ass
  uint256 internal constant MINIMUM_PROVING_COST_PER_MANA = 5415357955;
  uint256 internal constant MAX_PROVING_COST_MODIFIER = 1000000000;
  uint256 internal constant PROVING_UPDATE_FRACTION = 100000000000;

  uint256 internal constant MINIMUM_FEE_ASSET_PRICE = 10000000000;
  uint256 internal constant MAX_FEE_ASSET_PRICE_MODIFIER = 1000000000;
  uint256 internal constant FEE_ASSET_PRICE_UPDATE_FRACTION = 100000000000;

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
