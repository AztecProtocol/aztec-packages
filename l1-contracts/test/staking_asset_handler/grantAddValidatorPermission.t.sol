// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract GrantAddValidatorPermissionTest is StakingAssetHandlerBase {
  uint256 internal constant MINT_INTERVAL = 1;
  uint256 internal constant DEPOSITS_PER_MINT = 1;

  function setUp() public override {
    super.setUp();
    stakingAssetHandler = new StakingAssetHandler(
      address(this),
      address(stakingAsset),
      address(staking),
      WITHDRAWER,
      MINIMUM_STAKE,
      MINT_INTERVAL,
      DEPOSITS_PER_MINT,
      new address[](0)
    );
    stakingAsset.addMinter(address(stakingAssetHandler));
  }

  function test_WhenCallerOfGrantAddValidatorPermissionIsNotOwner(address _caller) external {
    // it reverts
    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.grantAddValidatorPermission(address(1));
  }

  function test_WhenCallerOfGrantAddValidatorPermissionIsOwner(address _address) external {
    // it grants add validator permission
    // it emits a {AddValidatorPermissionGranted} event
    vm.assume(_address != address(this));

    // first check that we cannot add a validator
    vm.expectRevert(
      abi.encodeWithSelector(IStakingAssetHandler.NotCanAddValidator.selector, _address)
    );
    vm.prank(_address);
    stakingAssetHandler.addValidator(address(1), address(2));

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddValidatorPermissionGranted(_address);
    stakingAssetHandler.grantAddValidatorPermission(_address);
    assertEq(stakingAssetHandler.canAddValidator(_address), true);

    // now check that we can add a validator
    vm.warp(MINT_INTERVAL + 1);
    vm.prank(_address);
    stakingAssetHandler.addValidator(address(1), address(2));
  }
}
