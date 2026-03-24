// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {FeeConfig} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";
import {EconomicsHarness} from "@test/harnesses/EconomicsHarness.sol";
import {EconomicsInitArgs} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {EthValue} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";

contract UpdateManaTargetTest is TestBase {
  uint256 internal constant INITIAL_MANA_TARGET = 100_000_000;
  uint256 internal constant MAGIC_CONGESTION_VALUE_DIVISOR = 1e8;
  uint256 internal constant MAGIC_CONGESTION_VALUE_MULTIPLIER = 854_700_854;

  EconomicsHarness private economics;

  function setUp() public {
    economics = _deployEconomics(INITIAL_MANA_TARGET);
  }

  function test_WhenManaLimitGTUint32(uint256 _manaTarget) external {
    uint256 manaTarget = bound(_manaTarget, uint256(type(uint32).max) / 2 + 1, type(uint256).max / 2);

    vm.expectRevert(abi.encodeWithSelector(Errors.FeeLib__InvalidManaLimit.selector, type(uint32).max, manaTarget * 2));
    economics.updateManaTarget(manaTarget);
  }

  function test_WhenManaLimitLEUint32(uint256 _manaTarget) external {
    uint256 manaTarget = bound(_manaTarget, INITIAL_MANA_TARGET, type(uint32).max / 2);

    economics.updateManaTarget(manaTarget);

    FeeConfig memory config = economics.getFeeConfig();
    assertEq(config.manaTarget, manaTarget);
    assertEq(config.manaTarget * 2, manaTarget * 2);
    assertEq(
      config.congestionUpdateFraction, manaTarget * MAGIC_CONGESTION_VALUE_MULTIPLIER / MAGIC_CONGESTION_VALUE_DIVISOR
    );
    assertEq(EthValue.unwrap(config.provingCostPerMana), 100);
  }

  function _deployEconomics(uint256 _manaTarget) internal returns (EconomicsHarness) {
    return new EconomicsHarness(
      address(this),
      address(this),
      IERC20(address(0)),
      EconomicsInitArgs({
        manaTarget: _manaTarget,
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
}
