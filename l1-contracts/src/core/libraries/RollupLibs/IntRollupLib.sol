// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  FeeMath, ManaBaseFeeComponents, FeeHeader, MANA_TARGET, FeeAssetPerEthX9
} from "./FeeMath.sol";

// We are using this library such that we can more easily "link" just a larger external library
// instead of a few smaller ones.
library IntRollupLib {
  function summedBaseFee(ManaBaseFeeComponents memory _components) internal pure returns (uint256) {
    return FeeMath.summedBaseFee(_components);
  }

  function clampedAdd(uint256 _a, int256 _b) internal pure returns (uint256) {
    return FeeMath.clampedAdd(_a, _b);
  }

  function getFeeAssetPerEth(uint256 _numerator) internal pure returns (FeeAssetPerEthX9) {
    return FeeMath.getFeeAssetPerEth(_numerator);
  }

  function computeExcessMana(FeeHeader memory _feeHeader) internal pure returns (uint256) {
    return clampedAdd(_feeHeader.excessMana + _feeHeader.manaUsed, -int256(MANA_TARGET));
  }
}
