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

    // Update the config to have sane values that can be compressed. All flush-size invariants
    // checked by assertValidQueueConfig must hold here.
    _config.maxQueueFlushSize = bound(_config.maxQueueFlushSize, 1, type(uint32).max);
    _config.bootstrapValidatorSetSize = bound(_config.bootstrapValidatorSetSize, 0, type(uint32).max);
    // bootstrapFlushSize must be > 0 when bootstrap is active, and never exceed maxQueueFlushSize.
    uint256 lower = _config.bootstrapValidatorSetSize == 0 ? 0 : 1;
    _config.bootstrapFlushSize = bound(_config.bootstrapFlushSize, lower, _config.maxQueueFlushSize);
    _config.normalFlushSizeMin = bound(_config.normalFlushSizeMin, 1, type(uint32).max);
    _config.normalFlushSizeQuotient = bound(_config.normalFlushSizeQuotient, 1, type(uint32).max);

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

  function test_RevertsWhenMaxQueueFlushSizeIsZero(StakingQueueConfig memory _config)
    external
    givenCallerIsTheRollupOwner
  {
    // A zero maxQueueFlushSize would trap queued validator stake in the normal phase: the
    // Math.min(..., 0) clamp inside getEntryQueueFlushSize would pin every flush at zero.
    _config.normalFlushSizeMin = bound(_config.normalFlushSizeMin, 1, type(uint32).max);
    _config.normalFlushSizeQuotient = bound(_config.normalFlushSizeQuotient, 1, type(uint32).max);
    _config.maxQueueFlushSize = 0;
    _config.bootstrapValidatorSetSize = 0;
    _config.bootstrapFlushSize = 0;

    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    address owner = rollup.owner();
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__InvalidMaxQueueFlushSize.selector));
    vm.prank(owner);
    staking.updateStakingQueueConfig(_config);
  }

  function test_RevertsWhenBootstrapFlushSizeIsZeroWithBootstrapMode(StakingQueueConfig memory _config)
    external
    givenCallerIsTheRollupOwner
  {
    // A zero bootstrap flush size traps queued validators during bootstrap growth: the
    // bootstrap branch in getEntryQueueFlushSize returns bootstrapFlushSize directly.
    _config.normalFlushSizeMin = bound(_config.normalFlushSizeMin, 1, type(uint32).max);
    _config.normalFlushSizeQuotient = bound(_config.normalFlushSizeQuotient, 1, type(uint32).max);
    _config.maxQueueFlushSize = bound(_config.maxQueueFlushSize, 1, type(uint32).max);
    _config.bootstrapValidatorSetSize = bound(_config.bootstrapValidatorSetSize, 1, type(uint32).max);
    _config.bootstrapFlushSize = 0;

    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    address owner = rollup.owner();
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__InvalidBootstrapFlushSize.selector));
    vm.prank(owner);
    staking.updateStakingQueueConfig(_config);
  }

  function test_RevertsWhenBootstrapFlushSizeExceedsMaxQueueFlushSize(uint256 _max, uint256 _bootstrap)
    external
    givenCallerIsTheRollupOwner
  {
    // Without this guard the bootstrap branch in getEntryQueueFlushSize would return a value
    // above the cap that the docs claim binds every phase.
    uint256 maxQueueFlushSize = bound(_max, 1, type(uint32).max - 1);
    uint256 bootstrapFlushSize = bound(_bootstrap, maxQueueFlushSize + 1, type(uint32).max);

    StakingQueueConfig memory config = StakingQueueConfig({
      bootstrapValidatorSetSize: 1,
      bootstrapFlushSize: bootstrapFlushSize,
      normalFlushSizeMin: 1,
      normalFlushSizeQuotient: 1,
      maxQueueFlushSize: maxQueueFlushSize
    });

    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    address owner = rollup.owner();
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Staking__BootstrapFlushSizeAboveMax.selector, bootstrapFlushSize, maxQueueFlushSize)
    );
    vm.prank(owner);
    staking.updateStakingQueueConfig(config);
  }
}
