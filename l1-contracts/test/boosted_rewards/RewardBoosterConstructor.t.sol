// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;
// solhint-disable func-name-mixedcase
// solhint-disable comprehensive-interface

import {Test} from "forge-std/Test.sol";
import {RewardBooster, RewardBoostConfig} from "@aztec/core/reward-boost/RewardBooster.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

/// @notice Verifies the RewardBooster constructor rejects configs that can make `_toShares`
///         return zero, since RewardLib treats zero shares as the duplicate-submission
///         sentinel.
contract RewardBoosterConstructorTest is Test {
  IValidatorSelection internal constant ROLLUP = IValidatorSelection(address(0xC0FFEE));

  function _validConfig() internal pure returns (RewardBoostConfig memory) {
    return RewardBoostConfig({increment: 200_000, maxScore: 5_000_000, a: 5000, minimum: 100_000, k: 1_000_000});
  }

  function test_acceptsValidConfig() external {
    RewardBoostConfig memory config = _validConfig();
    RewardBooster booster = new RewardBooster(ROLLUP, config);
    assertTrue(address(booster) != address(0), "valid config must deploy");
  }

  function test_revertsWhenKIsZero() external {
    RewardBoostConfig memory config = _validConfig();
    config.k = 0;

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardBooster__InvalidConfig.selector));
    new RewardBooster(ROLLUP, config);
  }

  function test_revertsWhenMinimumIsZero() external {
    RewardBoostConfig memory config = _validConfig();
    config.minimum = 0;

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardBooster__InvalidConfig.selector));
    new RewardBooster(ROLLUP, config);
  }

  function test_revertsWhenMaxScoreIsZero() external {
    RewardBoostConfig memory config = _validConfig();
    config.maxScore = 0;

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardBooster__InvalidConfig.selector));
    new RewardBooster(ROLLUP, config);
  }

  function test_revertsWhenMinimumExceedsK() external {
    RewardBoostConfig memory config = _validConfig();
    config.minimum = config.k + 1;

    vm.expectRevert(abi.encodeWithSelector(Errors.RewardBooster__InvalidConfig.selector));
    new RewardBooster(ROLLUP, config);
  }

  function test_acceptsMinimumEqualToK() external {
    RewardBoostConfig memory config = _validConfig();
    config.minimum = config.k;

    RewardBooster booster = new RewardBooster(ROLLUP, config);
    assertTrue(address(booster) != address(0), "minimum == k must deploy");
  }
}
