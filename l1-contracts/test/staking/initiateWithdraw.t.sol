// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IStaking, Status, ValidatorInfo, Exit} from "@aztec/core/staking/Staking.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";

contract InitiateWithdrawTest is StakingBase {
  function test_WhenAttesterIsNotRegistered() external {
    // it revert

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Staking__NotWithdrawer.selector, address(0), address(this))
    );
    staking.initiateWithdraw(ATTESTER, RECIPIENT);
  }

  modifier whenAttesterIsRegistered() {
    stakingAsset.mint(address(this), MINIMUM_STAKE);
    stakingAsset.approve(address(staking), MINIMUM_STAKE);
    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _amount: MINIMUM_STAKE
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

    staking.cheat__SetStatus(ATTESTER, Status.EXITING);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NothingToExit.selector, ATTESTER));
    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);

    // Should not be possible to hit this, as you should have failed with withdrawer being address(0)
    staking.cheat__SetStatus(ATTESTER, Status.NONE);
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

    // Again, this should not be possible to hit
    staking.cheat__RemoveAttester(ATTESTER);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__FailedToRemove.selector, ATTESTER));
    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);
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

    assertEq(stakingAsset.balanceOf(address(staking)), MINIMUM_STAKE);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);
    Exit memory exit = staking.getExit(ATTESTER);
    assertEq(exit.exitableAt, Timestamp.wrap(0));
    assertEq(exit.recipient, address(0));
    ValidatorInfo memory info = staking.getInfo(ATTESTER);
    assertTrue(info.status == Status.VALIDATING);
    assertEq(staking.getActiveAttesterCount(), 1);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStaking.WithdrawInitiated(ATTESTER, RECIPIENT, MINIMUM_STAKE);

    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);

    assertEq(stakingAsset.balanceOf(address(staking)), MINIMUM_STAKE);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);
    exit = staking.getExit(ATTESTER);
    assertEq(exit.exitableAt, Timestamp.wrap(block.timestamp) + staking.EXIT_DELAY());
    assertEq(exit.recipient, RECIPIENT);
    info = staking.getInfo(ATTESTER);
    assertTrue(info.status == Status.EXITING);
    assertEq(staking.getActiveAttesterCount(), 0);
  }

  function test_GivenAttesterIsLiving() external whenAttesterIsRegistered whenCallerIsTheWithdrawer {
    // it creates an exit struct
    // it updates the operator status to exiting
    // it emits a {WithdrawInitiated} event

    staking.cheat__SetStatus(ATTESTER, Status.LIVING);
    staking.cheat__RemoveAttester(ATTESTER);

    assertEq(stakingAsset.balanceOf(address(staking)), MINIMUM_STAKE);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);
    Exit memory exit = staking.getExit(ATTESTER);
    assertEq(exit.exitableAt, Timestamp.wrap(0));
    assertEq(exit.recipient, address(0));
    ValidatorInfo memory info = staking.getInfo(ATTESTER);
    assertTrue(info.status == Status.LIVING);
    assertEq(staking.getActiveAttesterCount(), 0);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStaking.WithdrawInitiated(ATTESTER, RECIPIENT, MINIMUM_STAKE);

    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);

    assertEq(stakingAsset.balanceOf(address(staking)), MINIMUM_STAKE);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);
    exit = staking.getExit(ATTESTER);
    assertEq(exit.exitableAt, Timestamp.wrap(block.timestamp) + staking.EXIT_DELAY());
    assertEq(exit.recipient, RECIPIENT);
    info = staking.getInfo(ATTESTER);
    assertTrue(info.status == Status.EXITING);
    assertEq(staking.getActiveAttesterCount(), 0);
  }
}
