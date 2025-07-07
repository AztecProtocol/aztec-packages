// SPDX-License-Identifier: UNLICENSED
// solhint-disable func-name-mixedcase
// solhint-disable imports-order
// solhint-disable comprehensive-interface
// solhint-disable ordering

pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {StakingQueueConfig} from "@aztec/core/libraries/StakingQueue.sol";
import {IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Ownable} from "@oz/access/Ownable.sol";

contract UpdateStakingQueueConfigTest is StakingBase {
  function test_GivenCallerIsNotTheRollupOwner(address _caller, StakingQueueConfig memory _config)
    external
  {
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

  function test_GivenCallerIsRollupOwner(StakingQueueConfig memory _config)
    external
    givenCallerIsTheRollupOwner
  {
    // it updates the staking queue config
    // it emits a {StakingQueueConfigUpdated} event
    Rollup rollup = Rollup(address(registry.getCanonicalRollup()));
    vm.prank(rollup.owner());
    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.StakingQueueConfigUpdated(_config);
    staking.updateStakingQueueConfig(_config);
  }
}
