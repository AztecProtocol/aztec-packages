// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {StakingAssetHandlerBase} from "./base.t.sol";
import {StakingAssetHandler, IStakingAssetHandler} from "@aztec/mock/StakingAssetHandler.sol";
import {Ownable} from "@oz/access/Ownable.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase
// solhint-disable ordering

contract SetWithdrawerTest is StakingAssetHandlerBase {
  function setUp() public override {
    super.setUp();
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
    vm.assume(_newWithdrawer != address(0));

    stakingAssetHandler.setWithdrawer(_newWithdrawer);
    assertEq(stakingAssetHandler.withdrawer(), _newWithdrawer);

    stakingAssetHandler.addUnhinged(address(this));
    address rollup = stakingAssetHandler.getRollup();

    address attester = address(1);

    vm.expectEmit(true, true, true, true, address(stakingAssetHandler));
    emit IStakingAssetHandler.ValidatorAdded(rollup, attester, _newWithdrawer);
    stakingAssetHandler.addValidator(attester);
    assertEq(staking.getConfig(attester).withdrawer, _newWithdrawer);
  }
}
