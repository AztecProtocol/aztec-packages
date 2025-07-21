// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetSkipMerkleCheckTest is StakingAssetHandlerBase {
  function test_WhenCallerOfSetSkipMerkleCheckIsNotOwner(address _caller, bool _skip) external {
    // it reverts

    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.setSkipMerkleCheck(_skip);
  }

  function test_WhenCallerOfSetSkipMerkleCheckIsOwner(bool _skip) external {
    // it sets the skipMerkleCheck
    // it emits a {SkipMerkleCheckUpdated} event

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.SkipMerkleCheckUpdated(_skip);
    stakingAssetHandler.setSkipMerkleCheck(_skip);
  }
}
