// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetZKPassportVerifier is StakingAssetHandlerBase {
  function test_WhenCallerOfSetScopeIsNotOwner(address _caller) external {
    // it reverts

    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.setZKPassportVerifier(address(42));
  }

  function test_WhenCallerOfSetScopeIsOwner(address _verifier) external {
    // it sets the zk passport verifier
    // it emits a {ZKPassportVerifierUpdated} event

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ZKPassportVerifierUpdated(_verifier);
    stakingAssetHandler.setZKPassportVerifier(_verifier);
  }
}
