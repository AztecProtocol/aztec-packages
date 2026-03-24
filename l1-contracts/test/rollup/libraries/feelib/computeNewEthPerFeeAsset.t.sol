// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {EthValue, EthPerFeeAssetE12} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {EconomicsInitArgs} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {EconomicsHarness} from "@test/harnesses/EconomicsHarness.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

contract ComputeNewEthPerFeeAssetTest is TestBase {
  uint256 internal constant MIN_ETH_PER_FEE_ASSET = 100;
  uint256 internal constant MAX_ETH_PER_FEE_ASSET = 1e14;
  uint256 internal constant MAX_FEE_ASSET_PRICE_MODIFIER_BPS = 100;
  int256 internal constant MAX_FEE_ASSET_PRICE_MODIFIER_BPS_INT = 100;

  EconomicsHarness private economics;

  function setUp() public {
    economics = new EconomicsHarness(
      address(this),
      address(this),
      IERC20(address(0)),
      EconomicsInitArgs({
        manaTarget: TestConstants.AZTEC_MANA_TARGET,
        provingCostPerMana: EthValue.wrap(100),
        initialEthPerFeeAsset: TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET,
        rewardConfig: TestConstants.getRewardConfig(),
        rewardBoostConfig: TestConstants.getRewardBoostConfig(),
        genesisTime: block.timestamp,
        aztecSlotDuration: TestConstants.AZTEC_SLOT_DURATION,
        aztecEpochDuration: TestConstants.AZTEC_EPOCH_DURATION,
        aztecProofSubmissionEpochs: TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
      })
    );
  }

  function test_WhenAtMinPrice_CanIncrease() external view {
    uint256 increased = economics.computeNewEthPerFeeAsset(MIN_ETH_PER_FEE_ASSET, MAX_FEE_ASSET_PRICE_MODIFIER_BPS_INT);
    uint256 expected = MIN_ETH_PER_FEE_ASSET * (10_000 + MAX_FEE_ASSET_PRICE_MODIFIER_BPS) / 10_000;
    assertEq(increased, expected);
    assertGt(increased, MIN_ETH_PER_FEE_ASSET, "Must increase by at least 1");
  }

  function test_WhenAtMinPrice_DecreaseClamps() external view {
    uint256 decreased = economics.computeNewEthPerFeeAsset(MIN_ETH_PER_FEE_ASSET, -MAX_FEE_ASSET_PRICE_MODIFIER_BPS_INT);
    assertEq(decreased, MIN_ETH_PER_FEE_ASSET);
  }

  function test_WhenAtMaxPrice_IncreaseClamps() external view {
    uint256 increased = economics.computeNewEthPerFeeAsset(MAX_ETH_PER_FEE_ASSET, MAX_FEE_ASSET_PRICE_MODIFIER_BPS_INT);
    assertEq(increased, MAX_ETH_PER_FEE_ASSET);
  }

  function test_WhenAtMaxPrice_CanDecrease() external view {
    uint256 expected = MAX_ETH_PER_FEE_ASSET * (10_000 - MAX_FEE_ASSET_PRICE_MODIFIER_BPS) / 10_000;
    uint256 decreased = economics.computeNewEthPerFeeAsset(MAX_ETH_PER_FEE_ASSET, -MAX_FEE_ASSET_PRICE_MODIFIER_BPS_INT);
    assertEq(decreased, expected);
  }

  function test_WhenModifierIsZero(uint256 _price) external view {
    uint256 price = bound(_price, MIN_ETH_PER_FEE_ASSET, MAX_ETH_PER_FEE_ASSET);
    uint256 result = economics.computeNewEthPerFeeAsset(price, 0);
    assertEq(result, price, "Zero modifier should not change price");
  }

  function test_WhenPriceInMiddleRange(uint256 _price, int256 _modifier) external view {
    uint256 price = bound(_price, MIN_ETH_PER_FEE_ASSET, MAX_ETH_PER_FEE_ASSET);
    int256 modifierBps = bound(_modifier, -MAX_FEE_ASSET_PRICE_MODIFIER_BPS_INT, MAX_FEE_ASSET_PRICE_MODIFIER_BPS_INT);

    uint256 result = economics.computeNewEthPerFeeAsset(price, modifierBps);

    assertGe(result, MIN_ETH_PER_FEE_ASSET, "Result should be >= MIN");
    assertLe(result, MAX_ETH_PER_FEE_ASSET, "Result should be <= MAX");
  }
}
