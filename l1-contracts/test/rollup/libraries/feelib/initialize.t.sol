// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  MAGIC_CONGESTION_VALUE_MULTIPLIER,
  MAGIC_CONGESTION_VALUE_DIVISOR,
  MAX_INITIAL_PROVING_COST_PER_MANA,
  EthValue,
  EthPerFeeAssetE12
} from "@aztec/core/libraries/rollup/FeeLib.sol";
import {FeeLibWrapper} from "./FeeLibWrapper.sol";
import {TestBase} from "@test/base/Base.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {FeeConfig} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {
  L1GasOracleValues,
  CompressedL1FeeData,
  FeeStructsLib
} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {Slot} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";

contract InitializeTest is TestBase {
  using FeeStructsLib for CompressedL1FeeData;

  FeeLibWrapper private feeLibWrapper = new FeeLibWrapper();

  function test_WhenManaTargetIsZero() external {
    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__InvalidManaTarget.selector, 1, 0));
    feeLibWrapper.initialize(0, TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET);
  }

  function test_WhenProvingCostBelowFloor(uint256 _provingCost) external {
    // it reverts with {FeeLib__ProvingCostBelowFloor}
    // Without enforcement here, a deploy with provingCost < 2 would permanently freeze the
    // rate limiter (the step-cap algebra in updateProvingCostPerMana requires current >= 2).
    uint256 provingCost = bound(_provingCost, 0, 1);

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__ProvingCostBelowFloor.selector, provingCost, 2));
    feeLibWrapper.initialize(1, EthValue.wrap(provingCost), TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET);
  }

  function test_WhenProvingCostAtFloor() external {
    // it initializes successfully at the floor
    feeLibWrapper.initialize(1, EthValue.wrap(2), TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET);
    assertEq(EthValue.unwrap(feeLibWrapper.getConfig().provingCostPerMana), 2);
  }

  function test_WhenProvingCostAboveCeiling(uint256 _provingCost) external {
    // it reverts with {FeeLib__ProvingCostAboveCeiling}
    // The uint64 storage cap inside compress() is not a safe economic bound: a deploy near
    // uint64.max would need many years of (3/2)-per-cooldown corrections before the value
    // returned to a normal operating range.
    uint256 provingCost = bound(_provingCost, MAX_INITIAL_PROVING_COST_PER_MANA + 1, type(uint256).max);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.FeeLib__ProvingCostAboveCeiling.selector, provingCost, MAX_INITIAL_PROVING_COST_PER_MANA
      )
    );
    feeLibWrapper.initialize(1, EthValue.wrap(provingCost), TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET);
  }

  function test_WhenProvingCostAtCeiling() external {
    // it initializes successfully at the ceiling
    feeLibWrapper.initialize(
      1, EthValue.wrap(MAX_INITIAL_PROVING_COST_PER_MANA), TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET
    );
    assertEq(EthValue.unwrap(feeLibWrapper.getConfig().provingCostPerMana), MAX_INITIAL_PROVING_COST_PER_MANA);
  }

  function test_WhenManaLimitGTUint32(uint256 _manaTarget) external {
    // it reverts with {FeeLib__InvalidManaLimit}

    uint256 manaTarget = bound(_manaTarget, uint256(type(uint32).max) / 2 + 1, type(uint256).max / 2);
    emit log_named_uint("manaTarget", manaTarget);

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__InvalidManaLimit.selector, type(uint32).max, manaTarget * 2));
    feeLibWrapper.initialize(manaTarget, TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET);
  }

  function test_WhenManaLimitLEUint32(uint256 _manaTarget) external {
    // it store the config
    // it store the l1 gas oracle values

    uint256 manaTarget = bound(_manaTarget, 1, type(uint32).max / 2);

    feeLibWrapper.initialize(manaTarget, TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET);

    assertEq(feeLibWrapper.getManaTarget(), manaTarget);
    assertEq(feeLibWrapper.getManaLimit(), manaTarget * 2);

    FeeConfig memory config = feeLibWrapper.getConfig();
    assertEq(config.manaTarget, manaTarget);
    assertEq(
      config.congestionUpdateFraction, manaTarget * MAGIC_CONGESTION_VALUE_MULTIPLIER / MAGIC_CONGESTION_VALUE_DIVISOR
    );
    assertEq(EthValue.unwrap(config.provingCostPerMana), 100);

    L1GasOracleValues memory l1GasOracleValues = feeLibWrapper.getL1GasOracleValues();
    assertEq(l1GasOracleValues.pre.getBaseFee(), 1 gwei, "Pre base fee");
    assertEq(l1GasOracleValues.pre.getBlobFee(), 1, "Pre blob fee");
    assertEq(l1GasOracleValues.post.getBaseFee(), block.basefee, "Post base fee");
    assertEq(l1GasOracleValues.post.getBlobFee(), vm.getBlobBaseFee(), "Post blob fee");
    assertEq(Slot.unwrap(CompressedTimeMath.decompress(l1GasOracleValues.slotOfChange)), 5, "Slot of change");
  }
}
