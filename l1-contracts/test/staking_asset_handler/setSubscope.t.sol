// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetSubscopeTest is StakingAssetHandlerBase {
  string subscope = "some.new.subscope.com";

  function test_WhenCallerOfSetSubscopeIsNotOwner(address _caller) external {
    // it reverts

    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.setSubscope(subscope);
  }

  function test_WhenCallerOfSetSubscopeIsOwner() external {
    // it sets the subscope
    // it emits a {SubScopeUpdated} event

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.SubScopeUpdated(subscope);
    stakingAssetHandler.setSubscope(subscope);
  }
}
