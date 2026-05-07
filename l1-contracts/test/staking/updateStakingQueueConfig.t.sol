// SPDX-License-Identifier: UNLICENSED
// solhint-disable func-name-mixedcase
// solhint-disable imports-order
// solhint-disable comprehensive-interface
// solhint-disable ordering

pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/compressed-data/StakingQueueConfig.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Ownable} from "@oz/access/Ownable.sol";

contract UpdateStakingQueueConfigTest is StakingBase {
  function test_GivenCallerIsNotTheRollupOwner(address _caller, StakingQueueConfig memory _config) external {
    // it reverts
    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    vm.assume(rollup.owner() != _caller);

    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    staking.updateStakingQueueConfig(_config);
  }

  modifier givenCallerIsTheRollupOwner() {
    _;
  }

  function test_GivenCallerIsRollupOwner(StakingQueueConfig memory _config) external givenCallerIsTheRollupOwner {
    // it updates the staking queue config
    // it emits a {StakingQueueConfigUpdated} event

    // Update the config to have sane values that can be compressed. Min and quotient must stay
    // strictly positive -- zero is rejected by assertValidQueueConfig.
    _config.bootstrapValidatorSetSize = bound(_config.bootstrapValidatorSetSize, 0, type(uint32).max);
    _config.bootstrapFlushSize = bound(_config.bootstrapFlushSize, 0, type(uint32).max);
    _config.normalFlushSizeMin = bound(_config.normalFlushSizeMin, 1, type(uint32).max);
    _config.normalFlushSizeQuotient = bound(_config.normalFlushSizeQuotient, 1, type(uint32).max);
    _config.maxQueueFlushSize = bound(_config.maxQueueFlushSize, 0, type(uint32).max);

    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    vm.prank(rollup.owner());
    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.StakingQueueConfigUpdated(_config);
    staking.updateStakingQueueConfig(_config);
  }

  function test_RevertsWhenFlushSizeMinIsZero(StakingQueueConfig memory _config) external givenCallerIsTheRollupOwner {
    _config.normalFlushSizeMin = 0;
    _config.normalFlushSizeQuotient = bound(_config.normalFlushSizeQuotient, 1, type(uint32).max);

    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    address owner = rollup.owner();
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__InvalidStakingQueueConfig.selector));
    vm.prank(owner);
    staking.updateStakingQueueConfig(_config);
  }

  function test_RevertsWhenFlushSizeQuotientIsZero(StakingQueueConfig memory _config)
    external
    givenCallerIsTheRollupOwner
  {
    _config.normalFlushSizeMin = bound(_config.normalFlushSizeMin, 1, type(uint32).max);
    _config.normalFlushSizeQuotient = 0;

    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    address owner = rollup.owner();
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__InvalidNormalFlushSizeQuotient.selector));
    vm.prank(owner);
    staking.updateStakingQueueConfig(_config);
  }
}
