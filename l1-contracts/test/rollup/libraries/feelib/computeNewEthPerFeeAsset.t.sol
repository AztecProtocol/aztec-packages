// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  MIN_ETH_PER_FEE_ASSET,
  MAX_ETH_PER_FEE_ASSET,
  MAX_FEE_ASSET_PRICE_MODIFIER_BPS
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {FeeLibWrapper} from "./FeeLibWrapper.sol";
import {TestBase} from "@test/base/Base.sol";

contract ComputeNewEthPerFeeAssetTest is TestBase {
  FeeLibWrapper private wrapper = new FeeLibWrapper();

  function test_WhenAtMinPrice_CanIncrease() external view {
    // At MIN, +MAX_MODIFIER_BPS should increase by at least 1
    // This validates the invariant: MIN is set so max modifier always moves by at least 1
    uint256 increased =
      wrapper.computeNewEthPerFeeAsset(MIN_ETH_PER_FEE_ASSET, int256(MAX_FEE_ASSET_PRICE_MODIFIER_BPS));
    uint256 expected = MIN_ETH_PER_FEE_ASSET * (10_000 + MAX_FEE_ASSET_PRICE_MODIFIER_BPS) / 10_000;
    assertEq(increased, expected);
    assertGt(increased, MIN_ETH_PER_FEE_ASSET, "Must increase by at least 1");
  }

  function test_WhenAtMinPrice_DecreaseClamps() external view {
    // At MIN, -MAX_MODIFIER_BPS should clamp to MIN (can't go below)
    uint256 decreased =
      wrapper.computeNewEthPerFeeAsset(MIN_ETH_PER_FEE_ASSET, -int256(MAX_FEE_ASSET_PRICE_MODIFIER_BPS));
    assertEq(decreased, MIN_ETH_PER_FEE_ASSET);
  }

  function test_WhenAtMaxPrice_IncreaseClamps() external view {
    // At MAX, +MAX_MODIFIER_BPS should clamp to MAX
    uint256 increased =
      wrapper.computeNewEthPerFeeAsset(MAX_ETH_PER_FEE_ASSET, int256(MAX_FEE_ASSET_PRICE_MODIFIER_BPS));
    assertEq(increased, MAX_ETH_PER_FEE_ASSET);
  }

  function test_WhenAtMaxPrice_CanDecrease() external view {
    // At MAX, -MAX_MODIFIER_BPS should decrease correctly
    uint256 expected = MAX_ETH_PER_FEE_ASSET * (10_000 - MAX_FEE_ASSET_PRICE_MODIFIER_BPS) / 10_000;
    uint256 decreased =
      wrapper.computeNewEthPerFeeAsset(MAX_ETH_PER_FEE_ASSET, -int256(MAX_FEE_ASSET_PRICE_MODIFIER_BPS));
    assertEq(decreased, expected);
  }

  function test_WhenModifierIsZero(uint256 _price) external view {
    // Zero modifier should return same price (within bounds)
    uint256 price = bound(_price, MIN_ETH_PER_FEE_ASSET, MAX_ETH_PER_FEE_ASSET);
    uint256 result = wrapper.computeNewEthPerFeeAsset(price, 0);
    assertEq(result, price, "Zero modifier should not change price");
  }

  function test_WhenPriceInMiddleRange(uint256 _price, int256 _modifier) external view {
    // For prices in valid range with valid modifiers, result should be within bounds
    uint256 price = bound(_price, MIN_ETH_PER_FEE_ASSET, MAX_ETH_PER_FEE_ASSET);
    int256 modifierBps =
      bound(_modifier, -int256(MAX_FEE_ASSET_PRICE_MODIFIER_BPS), int256(MAX_FEE_ASSET_PRICE_MODIFIER_BPS));

    uint256 result = wrapper.computeNewEthPerFeeAsset(price, modifierBps);

    assertGe(result, MIN_ETH_PER_FEE_ASSET, "Result should be >= MIN");
    assertLe(result, MAX_ETH_PER_FEE_ASSET, "Result should be <= MAX");
  }
}
