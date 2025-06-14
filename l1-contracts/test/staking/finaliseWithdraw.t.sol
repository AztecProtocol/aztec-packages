// SPDX-License-Identifier: UNLICENSED
// solhint-disable
pragma solidity >=0.8.27;

import {Timestamp, Status, AttesterView, IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingBase} from "./base.t.sol";

contract FinaliseWithdrawTest is StakingBase {
  function test_GivenStatusIsNotExiting() external {
    // it revert

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotExiting.selector, ATTESTER));
    staking.finaliseWithdraw(ATTESTER);

    stakingAsset.mint(address(this), DEPOSIT_AMOUNT);
    stakingAsset.approve(address(staking), DEPOSIT_AMOUNT);

    staking.deposit({_attester: ATTESTER, _withdrawer: WITHDRAWER, _onCanonical: true});
    staking.flushEntryQueue();

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotExiting.selector, ATTESTER));
    staking.finaliseWithdraw(ATTESTER);

    vm.prank(SLASHER);
    staking.slash(ATTESTER, DEPOSIT_AMOUNT);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotExiting.selector, ATTESTER));
    staking.finaliseWithdraw(ATTESTER);
  }

  modifier givenStatusIsExiting() {
    // We deposit and initiate a withdraw

    stakingAsset.mint(address(this), DEPOSIT_AMOUNT);
    stakingAsset.approve(address(staking), DEPOSIT_AMOUNT);

    staking.deposit({_attester: ATTESTER, _withdrawer: WITHDRAWER, _onCanonical: true});
    staking.flushEntryQueue();

    vm.prank(WITHDRAWER);
    staking.initiateWithdraw(ATTESTER, RECIPIENT);

    _;
  }

  function test_GivenTimeIsBeforeUnlock() external givenStatusIsExiting {
    // it revert

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Staking__WithdrawalNotUnlockedYet.selector,
        Timestamp.wrap(block.timestamp),
        Timestamp.wrap(block.timestamp) + staking.getExitDelay()
      )
    );
    staking.finaliseWithdraw(ATTESTER);
  }

  function test_GivenTimeIsAfterUnlock(bool _claimedFromGov) external givenStatusIsExiting {
    // it deletes the exit
    // it deletes the operator info
    // it transfer funds to recipient
    // it emits a {WithdrawFinalised} event

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.EXITING);
    assertEq(attesterView.exit.exitableAt, Timestamp.wrap(block.timestamp) + staking.getExitDelay());
    assertEq(attesterView.exit.isRecipient, true);
    assertEq(attesterView.exit.recipientOrWithdrawer, RECIPIENT);

    vm.warp(Timestamp.unwrap(attesterView.exit.exitableAt));

    if (_claimedFromGov) {
      staking.getGSE().getGovernance().finaliseWithdraw(0);
    }

    address lookup = _claimedFromGov ? address(staking) : address(staking.getGSE().getGovernance());

    assertEq(stakingAsset.balanceOf(lookup), DEPOSIT_AMOUNT);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.WithdrawFinalised(ATTESTER, RECIPIENT, DEPOSIT_AMOUNT);
    staking.finaliseWithdraw(ATTESTER);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.exit.recipientOrWithdrawer, address(0));
    assertEq(attesterView.exit.exitableAt, Timestamp.wrap(0));
    assertTrue(attesterView.status == Status.NONE);

    assertEq(stakingAsset.balanceOf(lookup), 0);
    assertEq(stakingAsset.balanceOf(RECIPIENT), DEPOSIT_AMOUNT);
  }
}
