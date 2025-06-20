// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract AddUnhingedTest is StakingAssetHandlerBase {
  function setUp() public override {
    depositsPerMint = 100;
    super.setUp();
  }

  function test_WhenCallerOfAddUnhingedIsNotOwner(address _caller) external {
    // it reverts
    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.addUnhinged(address(1));
  }

  function test_WhenCallerOfAddUnhingedIsOwner(address _address) external {
    // it adds the unhinged address
    // it emits a {UnhingedAdded} event
    vm.assume(_address != address(this));

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.UnhingedAdded(_address);
    stakingAssetHandler.addUnhinged(_address);
    assertTrue(stakingAssetHandler.isUnhinged(_address));
  }
}
