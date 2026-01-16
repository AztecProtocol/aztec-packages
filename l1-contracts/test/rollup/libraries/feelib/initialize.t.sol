// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  MAGIC_CONGESTION_VALUE_MULTIPLIER,
  MAGIC_CONGESTION_VALUE_DIVISOR,
  EthValue
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

contract InitializeTest is TestBase {
  using FeeStructsLib for CompressedL1FeeData;

  FeeLibWrapper private feeLibWrapper = new FeeLibWrapper();

  function test_WhenManaLimitGTUint32(uint256 _manaTarget) external {
    // it reverts with {FeeLib__InvalidManaLimit}

    uint256 manaTarget = bound(_manaTarget, uint256(type(uint32).max) / 2 + 1, type(uint256).max / 2);
    emit log_named_uint("manaTarget", manaTarget);

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__InvalidManaLimit.selector, type(uint32).max, manaTarget * 2));
    feeLibWrapper.initialize(manaTarget);
  }

  function test_WhenManaLimitLEUint32(uint256 _manaTarget) external {
    // it store the config
    // it store the l1 gas oracle values

    uint256 manaTarget = bound(_manaTarget, 0, type(uint32).max / 2);

    feeLibWrapper.initialize(manaTarget);

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
