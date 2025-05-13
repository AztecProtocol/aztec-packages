// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract RemoveUnhingedTest is StakingAssetHandlerBase {
  function test_WhenCallerOfRemoveUnhingedIsNotOwner(address _caller) external {
    // it reverts
    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.removeUnhinged(address(1));
  }

  function test_WhenCallerOfRemoveUnhingedIsOwner(address _caller) external {
    // it removes the unhinged address
    // it emits a {UnhingedRemoved} event
    stakingAssetHandler.addUnhinged(_caller);
    assertTrue(stakingAssetHandler.isUnhinged(_caller));

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.UnhingedRemoved(_caller);
    stakingAssetHandler.removeUnhinged(_caller);
    assertFalse(stakingAssetHandler.isUnhinged(_caller));
  }
}
