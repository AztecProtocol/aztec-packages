// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetWithdrawerTest is StakingAssetHandlerBase {
  uint256 internal constant MINIMUM_MINT_INTERVAL = 1;
  uint256 internal constant MAX_DEPOSITS_PER_MINT = 1;

  function setUp() public override {
    super.setUp();
    stakingAssetHandler = new StakingAssetHandler(
      address(this),
      address(stakingAsset),
      address(staking),
      WITHDRAWER,
      MINIMUM_STAKE,
      MINIMUM_MINT_INTERVAL,
      MAX_DEPOSITS_PER_MINT,
      new address[](0)
    );
    stakingAsset.addMinter(address(stakingAssetHandler));
  }

  function test_WhenCallerOfSetWithdrawerIsNotOwner(address _caller) external {
    // it reverts
    vm.assume(_caller != address(this));
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    vm.prank(_caller);
    stakingAssetHandler.setWithdrawer(address(1));
  }

  function test_WhenCallerOfSetWithdrawerIsOwner(address _newWithdrawer) external {
    // it sets the withdrawer
    // it emits a {WithdrawerUpdated} event
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.WithdrawerUpdated(_newWithdrawer);
    stakingAssetHandler.setWithdrawer(_newWithdrawer);
    assertEq(stakingAssetHandler.withdrawer(), _newWithdrawer);
  }

  function test_WhenOwnerCallsAddValidatorAfterSettingTheWithdrawer(address _newWithdrawer)
    external
  {
    // it uses the new withdrawer
    stakingAssetHandler.setWithdrawer(_newWithdrawer);
    vm.warp(MINIMUM_MINT_INTERVAL);
    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(address(1), address(1), _newWithdrawer);
    stakingAssetHandler.addValidator(address(1), address(1));
    assertEq(stakingAssetHandler.withdrawer(), _newWithdrawer);
  }
}
