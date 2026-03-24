// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {EthPerFeeAssetE12, FeeConfig} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {
  CompressedL1FeeData,
  FeeStructsLib,
  L1GasOracleValues
} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {Slot} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {EconomicsHarness} from "@test/harnesses/EconomicsHarness.sol";
import {EconomicsInitArgs} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {EthValue} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

contract InitializeTest is TestBase {
  using FeeStructsLib for L1GasOracleValues;
  using FeeStructsLib for CompressedL1FeeData;

  uint256 internal constant MAGIC_CONGESTION_VALUE_DIVISOR = 1e8;
  uint256 internal constant MAGIC_CONGESTION_VALUE_MULTIPLIER = 854_700_854;

  function test_WhenManaLimitGTUint32(uint256 _manaTarget) external {
    uint256 manaTarget = bound(_manaTarget, uint256(type(uint32).max) / 2 + 1, type(uint256).max / 2);

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__InvalidManaLimit.selector, type(uint32).max, manaTarget * 2));
    _deployEconomics(manaTarget);
  }

  function test_WhenManaTargetIsZero_Revert() external {
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidManaTarget.selector, 1, 0));
    _deployEconomics(0);
  }

  function test_WhenManaLimitLEUint32(uint256 _manaTarget) external {
    uint256 manaTarget = bound(_manaTarget, 1, type(uint32).max / 2);
    EconomicsHarness economics = _deployEconomics(manaTarget);

    FeeConfig memory config = economics.getFeeConfig();
    assertEq(config.manaTarget, manaTarget);
    assertEq(config.manaTarget * 2, manaTarget * 2);
    assertEq(
      config.congestionUpdateFraction, manaTarget * MAGIC_CONGESTION_VALUE_MULTIPLIER / MAGIC_CONGESTION_VALUE_DIVISOR
    );
    assertEq(EthValue.unwrap(config.provingCostPerMana), 100);

    L1GasOracleValues memory l1GasOracleValues = economics.getL1GasOracleValues();
    assertEq(l1GasOracleValues.pre.getBaseFee(), 1 gwei, "Pre base fee");
    assertEq(l1GasOracleValues.pre.getBlobFee(), 1, "Pre blob fee");
    assertEq(l1GasOracleValues.post.getBaseFee(), block.basefee, "Post base fee");
    assertEq(l1GasOracleValues.post.getBlobFee(), vm.getBlobBaseFee(), "Post blob fee");
    assertEq(Slot.unwrap(CompressedTimeMath.decompress(l1GasOracleValues.slotOfChange)), 5, "Slot of change");
  }

  function test_WhenInitialEthPerFeeAssetBelowMinimum_Revert() external {
    uint256 initialPrice = 99;

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.FeeLib__InvalidInitialEthPerFeeAsset.selector, initialPrice, uint256(100), uint256(1e14)
      )
    );
    _deployEconomics(1, EthPerFeeAssetE12.wrap(initialPrice));
  }

  function test_WhenInitialEthPerFeeAssetAboveMaximum_Revert() external {
    uint256 initialPrice = 1e14 + 1;

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.FeeLib__InvalidInitialEthPerFeeAsset.selector, initialPrice, uint256(100), uint256(1e14)
      )
    );
    _deployEconomics(1, EthPerFeeAssetE12.wrap(initialPrice));
  }

  function _deployEconomics(uint256 _manaTarget) internal returns (EconomicsHarness) {
    return _deployEconomics(_manaTarget, TestConstants.AZTEC_INITIAL_ETH_PER_FEE_ASSET);
  }

  function _deployEconomics(uint256 _manaTarget, EthPerFeeAssetE12 _initialEthPerFeeAsset)
    internal
    returns (EconomicsHarness)
  {
    return new EconomicsHarness(
      address(this),
      address(this),
      IERC20(address(0)),
      EconomicsInitArgs({
        manaTarget: _manaTarget,
        provingCostPerMana: EthValue.wrap(100),
        initialEthPerFeeAsset: _initialEthPerFeeAsset,
        rewardConfig: TestConstants.getRewardConfig(),
        rewardBoostConfig: TestConstants.getRewardBoostConfig(),
        genesisTime: block.timestamp,
        aztecSlotDuration: TestConstants.AZTEC_SLOT_DURATION,
        aztecEpochDuration: TestConstants.AZTEC_EPOCH_DURATION,
        aztecProofSubmissionEpochs: TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
      })
    );
  }
}
