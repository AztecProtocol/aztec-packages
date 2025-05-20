// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  IStakingCore, Status, ValidatorInfo, Exit, Timestamp
} from "@aztec/core/interfaces/IStaking.sol";

contract SlashTest is StakingBase {
  uint256 internal DEPOSIT_AMOUNT;
  uint256 internal slashingAmount = 1;

  function setUp() public override {
    super.setUp();
    DEPOSIT_AMOUNT = MINIMUM_STAKE + 2;
  }

  function test_WhenCallerIsNotTheSlasher() external {
    // it reverts
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Staking__NotSlasher.selector, SLASHER, address(this))
    );
    staking.slash(ATTESTER, 1);
  }

  modifier whenCallerIsTheSlasher() {
    _;
  }

  function test_WhenAttesterIsNotRegistered() external whenCallerIsTheSlasher {
    // it reverts

    vm.prank(SLASHER);
    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NoOneToSlash.selector, ATTESTER));
    staking.slash(ATTESTER, 1);
  }

  modifier whenAttesterIsRegistered() {
    stakingAsset.mint(address(this), DEPOSIT_AMOUNT);
    stakingAsset.approve(address(staking), DEPOSIT_AMOUNT);

    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _amount: DEPOSIT_AMOUNT
    });
    _;
  }

  modifier whenAttesterIsExiting() {
    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);

    _;
  }

  function test_GivenTimeIsAfterUnlock()
    external
    whenCallerIsTheSlasher
    whenAttesterIsRegistered
    whenAttesterIsExiting
  {
    // it reverts

    Exit memory exit = staking.getExit(ATTESTER);
    vm.warp(Timestamp.unwrap(exit.exitableAt));

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Staking__CannotSlashExitedStake.selector, ATTESTER)
    );
    vm.prank(SLASHER);
    staking.slash(ATTESTER, 1);
  }

  function test_GivenTimeIsBeforeUnlock()
    external
    whenCallerIsTheSlasher
    whenAttesterIsRegistered
    whenAttesterIsExiting
  {
    // it reduce stake by amount
    // it emits {Slashed} event

    ValidatorInfo memory info = staking.getInfo(ATTESTER);
    assertEq(info.stake, DEPOSIT_AMOUNT);
    assertTrue(info.status == Status.EXITING);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, 1);
    vm.prank(SLASHER);
    staking.slash(ATTESTER, 1);

    info = staking.getInfo(ATTESTER);
    assertEq(info.stake, DEPOSIT_AMOUNT - 1);
    assertTrue(info.status == Status.EXITING);
  }

  function test_WhenAttesterIsNotExiting() external whenCallerIsTheSlasher whenAttesterIsRegistered {
    // it reduce stake by amount
    // it emits {Slashed} event

    for (uint256 i = 0; i < 2; i++) {
      // Prepare the status and state
      ValidatorInfo memory info = staking.getInfo(ATTESTER);
      assertTrue(info.status == Status.VALIDATING, "Invalid status");
      assertEq(staking.getActiveAttesterCount(), 1, "Invalid active attester count");
      uint256 balance = info.stake;

      vm.expectEmit(true, true, true, true, address(staking));
      emit IStakingCore.Slashed(ATTESTER, 2);
      vm.prank(SLASHER);
      staking.slash(ATTESTER, 2);

      info = staking.getInfo(ATTESTER);
      assertEq(info.stake, balance - 2, "Invalid stake");
      assertTrue(
        info.status == (i == 0 ? Status.VALIDATING : Status.LIVING), "Invalid status after slash"
      );
      assertEq(staking.getActiveAttesterCount(), i == 0 ? 1 : 0, "Invalid active attester count");
    }
  }

  modifier whenAttesterIsValidatingAndStakeIsBelowMinimumStake() {
    ValidatorInfo memory info = staking.getInfo(ATTESTER);
    slashingAmount = info.stake - MINIMUM_STAKE + 1;
    _;
  }

  function test_GivenAttesterIsNotActive()
    external
    whenCallerIsTheSlasher
    whenAttesterIsRegistered
    whenAttesterIsValidatingAndStakeIsBelowMinimumStake
  {
    // it reverts

    // This should be impossible to trigger in practice as the only case where attester is removed already
    // is if the status is none.
  }

  function test_GivenAttesterIsActive()
    external
    whenCallerIsTheSlasher
    whenAttesterIsRegistered
    whenAttesterIsValidatingAndStakeIsBelowMinimumStake
  {
    // it reduce stake by amount
    // it remove from active attesters
    // it set status to living
    // it emits {Slashed} event

    ValidatorInfo memory info = staking.getInfo(ATTESTER);
    assertTrue(info.status == Status.VALIDATING);
    uint256 activeAttesterCount = staking.getActiveAttesterCount();
    uint256 balance = info.stake;

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, slashingAmount);
    vm.prank(SLASHER);
    staking.slash(ATTESTER, slashingAmount);

    info = staking.getInfo(ATTESTER);
    assertEq(info.stake, balance - slashingAmount);
    assertTrue(info.status == Status.LIVING);

    assertEq(staking.getActiveAttesterCount(), activeAttesterCount - 1);
  }
}
