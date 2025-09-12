// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetDomainTest is StakingAssetHandlerBase {
  string domain = "some.new.scope.com";

  function test_WhenCallerOfSetDomainIsNotOwner(address _caller) external {
    // it reverts

    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.setDomain(domain);
  }

  function test_WhenCallerOfSetDomainIsOwner() external {
    // it sets the scope
    // it emits a {ScopeSet} event

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.DomainUpdated(domain);
    stakingAssetHandler.setDomain(domain);
  }
}
