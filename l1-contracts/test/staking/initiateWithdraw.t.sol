// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  Timestamp, Status, AttesterView, Exit, IStakingCore
} from "@aztec/core/interfaces/IStaking.sol";

contract InitiateWithdrawTest is StakingBase {
  function test_WhenAttesterIsNotRegistered() external {
    // it revert

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NothingToExit.selector, ATTESTER));
    staking.initiateWithdraw(ATTESTER, RECIPIENT);
  }

  modifier whenAttesterIsRegistered() {
    stakingAsset.mint(address(this), DEPOSIT_AMOUNT);
    stakingAsset.approve(address(staking), DEPOSIT_AMOUNT);
    staking.deposit({_attester: ATTESTER, _withdrawer: WITHDRAWER, _onCanonical: true});
    _;
  }

  function test_WhenCallerIsNotTheWithdrawer(address _caller) external whenAttesterIsRegistered {
    // it revert

    vm.assume(_caller != WITHDRAWER);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Staking__NotWithdrawer.selector, WITHDRAWER, _caller)
    );
    vm.prank(_caller);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);
  }

  modifier whenCallerIsTheWithdrawer() {
    _;
  }

  function test_GivenAttesterIsNotValidatingOrLiving()
    external
    whenAttesterIsRegistered
    whenCallerIsTheWithdrawer
  {
    // it revert

    assertTrue(staking.getStatus(address(1)) == Status.NONE);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NothingToExit.selector, address(1)));
    vm.prank(address(0));
    staking.initiateWithdraw(address(1), address(2));

    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);

    assertTrue(staking.getStatus(ATTESTER) == Status.EXITING);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NothingToExit.selector, ATTESTER));
    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);
  }

  modifier givenAttesterIsValidating() {
    _;
  }

  function test_GivenAttesterIsNotInTheActiveSet()
    external
    whenAttesterIsRegistered
    whenCallerIsTheWithdrawer
    givenAttesterIsValidating
  {
    // it revert
    // this should not be possible to hit
  }

  function test_GivenAttesterIsInTheActiveSet()
    external
    whenAttesterIsRegistered
    whenCallerIsTheWithdrawer
    givenAttesterIsValidating
  {
    // it removes the attester from the active set
    // it creates an exit struct
    // it updates the operator status to exiting
    // it emits a {WithdrawInitiated} event

    address lookup = address(staking.getGSE().getGovernance());

    assertEq(stakingAsset.balanceOf(lookup), DEPOSIT_AMOUNT);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);
    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.VALIDATING);
    assertEq(attesterView.exit.exitableAt, Timestamp.wrap(0));
    assertEq(attesterView.exit.exists, false);
    assertEq(attesterView.exit.isRecipient, false);
    assertEq(attesterView.exit.amount, 0);
    assertEq(attesterView.exit.recipientOrWithdrawer, address(0));

    assertEq(staking.getActiveAttesterCount(), 1);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.WithdrawInitiated(ATTESTER, RECIPIENT, DEPOSIT_AMOUNT);

    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);

    // @todo We should look at updating these, the location of balance depends on time
    // and whether the governance.finaliseWithdraw have been called now.
    assertEq(stakingAsset.balanceOf(lookup), DEPOSIT_AMOUNT);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.exit.exists, true);
    assertEq(attesterView.exit.isRecipient, true);
    assertEq(attesterView.exit.exitableAt, Timestamp.wrap(block.timestamp) + staking.getExitDelay());
    assertEq(attesterView.exit.recipientOrWithdrawer, RECIPIENT);
    assertTrue(attesterView.status == Status.EXITING);

    assertEq(staking.getActiveAttesterCount(), 0);
  }

  function test_GivenAttesterIsLiving() external whenAttesterIsRegistered whenCallerIsTheWithdrawer {
    // it creates an exit struct
    // it updates the operator status to exiting
    // it emits a {WithdrawInitiated} event

    address lookup = address(staking.getGSE().getGovernance());

    assertEq(stakingAsset.balanceOf(lookup), DEPOSIT_AMOUNT);

    uint256 slashAmount = DEPOSIT_AMOUNT - MINIMUM_STAKE + 1;

    vm.prank(SLASHER);
    staking.slash(ATTESTER, slashAmount);

    // @todo Again, need to cover more cases because funds could be many places now.
    // But if not called, the funds should still be in the governance
    assertEq(stakingAsset.balanceOf(lookup), DEPOSIT_AMOUNT);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.LIVING);
    assertEq(attesterView.exit.exitableAt, Timestamp.wrap(block.timestamp) + staking.getExitDelay());
    assertEq(attesterView.exit.exists, true);
    assertEq(attesterView.exit.isRecipient, false);
    assertEq(attesterView.exit.amount, DEPOSIT_AMOUNT - slashAmount);
    assertEq(attesterView.exit.recipientOrWithdrawer, WITHDRAWER);

    assertEq(staking.getActiveAttesterCount(), 0);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.WithdrawInitiated(ATTESTER, RECIPIENT, DEPOSIT_AMOUNT - slashAmount);

    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);

    assertEq(stakingAsset.balanceOf(lookup), DEPOSIT_AMOUNT);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);
    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.exit.exitableAt, Timestamp.wrap(block.timestamp) + staking.getExitDelay());
    assertEq(attesterView.exit.exists, true);
    assertEq(attesterView.exit.isRecipient, true);
    assertEq(attesterView.exit.amount, DEPOSIT_AMOUNT - slashAmount);
    assertEq(attesterView.exit.recipientOrWithdrawer, RECIPIENT);
    assertTrue(attesterView.status == Status.EXITING);
    assertEq(staking.getActiveAttesterCount(), 0);
  }
}
