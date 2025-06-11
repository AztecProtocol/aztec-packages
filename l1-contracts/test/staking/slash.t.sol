// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {
  IStakingCore, Status, AttesterView, Exit, Timestamp
} from "@aztec/core/interfaces/IStaking.sol";

contract SlashTest is StakingBase {
  uint256 internal slashingAmount = 1;

  function setUp() public override {
    super.setUp();
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

    staking.deposit({_attester: ATTESTER, _withdrawer: WITHDRAWER, _onCanonical: true});
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

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0);
    assertEq(attesterView.exit.amount, DEPOSIT_AMOUNT, "Invalid exit amount");
    assertTrue(attesterView.status == Status.EXITING);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, 1);
    vm.prank(SLASHER);
    staking.slash(ATTESTER, 1);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0);
    assertEq(attesterView.exit.amount, DEPOSIT_AMOUNT - 1, "Invalid exit amount 2");
    assertTrue(attesterView.status == Status.EXITING);
  }

  function test_WhenAttesterIsNotExiting() external whenCallerIsTheSlasher whenAttesterIsRegistered {
    // it reduce stake by amount
    // it emits {Slashed} event

    for (uint256 i = 0; i < 3; i++) {
      bool isAlive = i != 2;
      // Prepare the status and state
      AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
      assertTrue(
        attesterView.status == (isAlive ? Status.VALIDATING : Status.LIVING), "Invalid status"
      );
      assertEq(staking.getActiveAttesterCount(), isAlive ? 1 : 0, "Invalid active attester count");

      uint256 balance = isAlive ? attesterView.effectiveBalance : attesterView.exit.amount;
      slashingAmount = isAlive ? DEPOSIT_AMOUNT / 3 : balance;

      vm.expectEmit(true, true, true, true, address(staking));
      emit IStakingCore.Slashed(ATTESTER, slashingAmount);
      vm.prank(SLASHER);
      staking.slash(ATTESTER, slashingAmount);

      attesterView = staking.getAttesterView(ATTESTER);

      if (i == 0) {
        // The first round, we are still active, not slashing enough yet!
        assertEq(
          attesterView.effectiveBalance, balance - slashingAmount, "Invalid effective balance"
        );
        assertEq(attesterView.exit.amount, 0, "Invalid exit amount");
        assertTrue(attesterView.status == Status.VALIDATING, "Invalid status after slash");
        assertEq(staking.getActiveAttesterCount(), 1, "Invalid active attester count");
      } else if (i == 1) {
        // The second round, we are not longer active, but there are money left
        assertEq(attesterView.effectiveBalance, 0, "Invalid effective balance");
        assertEq(attesterView.exit.amount, balance - slashingAmount, "Invalid exit amount");
        assertTrue(attesterView.status == Status.LIVING, "Invalid status after slash");
        assertEq(staking.getActiveAttesterCount(), 0, "Invalid active attester count");
      } else {
        // Fully slashed! NUKE IT.
        assertEq(attesterView.effectiveBalance, 0, "Invalid effective balance");
        assertEq(attesterView.exit.amount, 0, "Invalid exit amount");
        assertTrue(attesterView.status == Status.NONE, "Invalid status after slash");
        assertEq(staking.getActiveAttesterCount(), 0, "Invalid active attester count");
      }
    }
  }

  modifier whenAttesterIsValidatingAndStakeIsBelowMinimumStake() {
    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    uint256 targetBalance = MINIMUM_STAKE - 1;

    slashingAmount = attesterView.effectiveBalance - targetBalance;
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

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.VALIDATING);
    uint256 activeAttesterCount = staking.getActiveAttesterCount();
    uint256 balance = attesterView.effectiveBalance;

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, slashingAmount);
    vm.prank(SLASHER);
    staking.slash(ATTESTER, slashingAmount);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0);
    assertEq(attesterView.exit.amount, balance - slashingAmount);
    assertTrue(attesterView.status == Status.LIVING);

    assertEq(staking.getActiveAttesterCount(), activeAttesterCount - 1);
  }

  function test_SlashingMoreThanBalance() external whenCallerIsTheSlasher whenAttesterIsRegistered {
    // it should slash only up to the available balance
    // it emits {Slashed} event with the actual slashed amount

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.VALIDATING);
    uint256 balance = attesterView.effectiveBalance;

    // Try to slash more than the balance
    uint256 amountToSlash = balance * 2;

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, balance);
    vm.prank(SLASHER);
    staking.slash(ATTESTER, amountToSlash);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0, "Effective balance should be 0");
    assertEq(attesterView.exit.amount, 0, "Exit amount should be 0");
    assertTrue(attesterView.status == Status.NONE, "Status should be NONE");
  }

  function test_SlashingMoreThanExitBalance() external whenCallerIsTheSlasher whenAttesterIsRegistered whenAttesterIsExiting {
    // it should slash only up to the available exit balance
    // it emits {Slashed} event with the actual slashed amount

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.EXITING);
    uint256 exitAmount = attesterView.exit.amount;

    // Try to slash more than the exit balance
    uint256 amountToSlash = exitAmount * 2;

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.Slashed(ATTESTER, exitAmount);
    vm.prank(SLASHER);
    staking.slash(ATTESTER, amountToSlash);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.effectiveBalance, 0, "Effective balance should be 0");
    assertEq(attesterView.exit.amount, 0, "Exit amount should be 0");
    assertTrue(attesterView.status == Status.NONE, "Status should be NONE");
  }
}
