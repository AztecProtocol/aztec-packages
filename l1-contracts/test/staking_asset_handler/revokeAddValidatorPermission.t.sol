// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract RevokeAddValidatorPermissionTest is StakingAssetHandlerBase {
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

  function test_WhenCallerOfRevokeAddValidatorPermissionIsNotOwner(address _caller) external {
    // it reverts
    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.revokeAddValidatorPermission(address(1));
  }

  function test_WhenCallerOfRevokeAddValidatorPermissionIsOwner(
    address _caller,
    address _attester,
    address _proposer
  ) external {
    vm.assume(_attester != address(0));
    vm.assume(_proposer != address(0));

    // it revokes add validator permission
    // it emits a {AddValidatorPermissionRevoked} event
    stakingAssetHandler.grantAddValidatorPermission(_caller);
    assertEq(stakingAssetHandler.canAddValidator(_caller), true);

    // first check that we can add a validator
    vm.warp(MINT_INTERVAL + 1);
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.AddValidatorPermissionRevoked(_caller);
    stakingAssetHandler.revokeAddValidatorPermission(_caller);
    assertEq(stakingAssetHandler.canAddValidator(_caller), false);

    // it reverts
    vm.expectRevert(
      abi.encodeWithSelector(IStakingAssetHandler.NotCanAddValidator.selector, _caller)
    );
    vm.prank(_caller);
    stakingAssetHandler.addValidator(_attester, _proposer);
  }
}
