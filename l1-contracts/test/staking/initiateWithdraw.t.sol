// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  Timestamp, Status, FullStatus, Exit, IStakingCore
} from "@aztec/core/interfaces/IStaking.sol";

contract InitiateWithdrawTest is StakingBase {
  function test_WhenAttesterIsNotRegistered() external {
    // it revert

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NothingToExit.selector, ATTESTER));
    staking.initiateWithdraw(ATTESTER, RECIPIENT);
  }

  modifier whenAttesterIsRegistered() {
    stakingAsset.mint(address(this), MINIMUM_STAKE);
    stakingAsset.approve(address(staking), MINIMUM_STAKE);
    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _onCanonical: true
    });
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

    assertEq(stakingAsset.balanceOf(address(staking.getGSE())), MINIMUM_STAKE);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);
    FullStatus memory info = staking.getFullStatus(ATTESTER);
    assertTrue(info.status == Status.VALIDATING);
    assertEq(info.exit.exitableAt, Timestamp.wrap(0));
    assertEq(info.exit.exists, false);
    assertEq(info.exit.isRecipient, false);
    assertEq(info.exit.amount, 0);
    assertEq(info.exit.recipientOrWithdrawer, address(0));

    assertEq(staking.getActiveAttesterCount(), 1);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.WithdrawInitiated(ATTESTER, RECIPIENT, MINIMUM_STAKE);

    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);

    assertEq(stakingAsset.balanceOf(address(staking)), MINIMUM_STAKE);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);

    info = staking.getFullStatus(ATTESTER);
    assertEq(info.exit.exists, true);
    assertEq(info.exit.isRecipient, true);
    assertEq(info.exit.exitableAt, Timestamp.wrap(block.timestamp) + staking.getExitDelay());
    assertEq(info.exit.recipientOrWithdrawer, RECIPIENT);
    assertTrue(info.status == Status.EXITING);

    assertEq(staking.getActiveAttesterCount(), 0);
  }

  function test_GivenAttesterIsLiving() external whenAttesterIsRegistered whenCallerIsTheWithdrawer {
    // it creates an exit struct
    // it updates the operator status to exiting
    // it emits a {WithdrawInitiated} event

    assertEq(stakingAsset.balanceOf(address(staking.getGSE())), MINIMUM_STAKE);

    vm.prank(SLASHER);
    staking.slash(ATTESTER, MINIMUM_STAKE / 2);

    assertEq(stakingAsset.balanceOf(address(staking)), MINIMUM_STAKE);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);

    FullStatus memory info = staking.getFullStatus(ATTESTER);
    assertTrue(info.status == Status.LIVING);
    assertEq(info.exit.exitableAt, Timestamp.wrap(block.timestamp) + staking.getExitDelay());
    assertEq(info.exit.exists, true);
    assertEq(info.exit.isRecipient, false);
    assertEq(info.exit.amount, MINIMUM_STAKE - MINIMUM_STAKE / 2);
    assertEq(info.exit.recipientOrWithdrawer, WITHDRAWER);

    assertEq(staking.getActiveAttesterCount(), 0);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.WithdrawInitiated(ATTESTER, RECIPIENT, MINIMUM_STAKE - MINIMUM_STAKE / 2);

    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);

    assertEq(stakingAsset.balanceOf(address(staking)), MINIMUM_STAKE);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);
    info = staking.getFullStatus(ATTESTER);
    assertEq(info.exit.exitableAt, Timestamp.wrap(block.timestamp) + staking.getExitDelay());
    assertEq(info.exit.exists, true);
    assertEq(info.exit.isRecipient, true);
    assertEq(info.exit.amount, MINIMUM_STAKE - MINIMUM_STAKE / 2);
    assertEq(info.exit.recipientOrWithdrawer, RECIPIENT);
    assertTrue(info.status == Status.EXITING);
    assertEq(staking.getActiveAttesterCount(), 0);
  }
}
