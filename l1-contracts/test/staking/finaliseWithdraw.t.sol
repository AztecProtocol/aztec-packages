// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {StakingBase} from "./base.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {IStaking, Status, ValidatorInfo, Exit} from "@aztec/core/staking/Staking.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";

contract FinaliseWithdrawTest is StakingBase {
  function test_GivenStatusIsNotExiting() external {
    // it revert

    for (uint256 i = 0; i < 3; i++) {
      staking.cheat__SetStatus(ATTESTER, Status(i));

      vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotExiting.selector, ATTESTER));
      staking.finaliseWithdraw(ATTESTER);
    }
  }

  modifier givenStatusIsExiting() {
    // We deposit and initiate a withdraw

    stakingAsset.mint(address(this), MINIMUM_STAKE);
    stakingAsset.approve(address(staking), MINIMUM_STAKE);

    staking.deposit({
      _attester: ATTESTER,
      _proposer: PROPOSER,
      _withdrawer: WITHDRAWER,
      _amount: MINIMUM_STAKE
    });

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
        Timestamp.wrap(block.timestamp) + staking.EXIT_DELAY()
      )
    );
    staking.finaliseWithdraw(ATTESTER);
  }

  function test_GivenTimeIsAfterUnlock() external givenStatusIsExiting {
    // it deletes the exit
    // it deletes the operator info
    // it transfer funds to recipient
    // it emits a {WithdrawFinalised} event

    Exit memory exit = staking.getExit(ATTESTER);
    assertEq(exit.recipient, RECIPIENT);
    assertEq(exit.exitableAt, Timestamp.wrap(block.timestamp) + staking.EXIT_DELAY());
    ValidatorInfo memory info = staking.getInfo(ATTESTER);
    assertTrue(info.status == Status.EXITING);

    assertEq(stakingAsset.balanceOf(address(staking)), MINIMUM_STAKE);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);

    vm.warp(Timestamp.unwrap(exit.exitableAt));

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStaking.WithdrawFinalised(ATTESTER, RECIPIENT, MINIMUM_STAKE);
    staking.finaliseWithdraw(ATTESTER);

    exit = staking.getExit(ATTESTER);
    assertEq(exit.recipient, address(0));
    assertEq(exit.exitableAt, Timestamp.wrap(0));

    info = staking.getInfo(ATTESTER);
    assertTrue(info.status == Status.NONE);

    assertEq(stakingAsset.balanceOf(address(staking)), 0);
    assertEq(stakingAsset.balanceOf(RECIPIENT), MINIMUM_STAKE);
  }
}
