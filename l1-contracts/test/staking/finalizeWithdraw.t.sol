// SPDX-License-Identifier: UNLICENSED
// solhint-disable
pragma solidity >=0.8.27;

import {Timestamp, Status, AttesterView, IStakingCore} from "@aztec/core/interfaces/IStaking.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {StakingBase} from "./base.t.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

contract FinalizeWithdrawTest is StakingBase {
  function test_GivenStatusIsNotExiting() external {
    // it revert

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotExiting.selector, ATTESTER));
    staking.finalizeWithdraw(ATTESTER);

    mint(address(this), ACTIVATION_THRESHOLD);
    stakingAsset.approve(address(staking), ACTIVATION_THRESHOLD);

    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
    staking.flushEntryQueue();

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__NotExiting.selector, ATTESTER));
    staking.finalizeWithdraw(ATTESTER);

    vm.prank(SLASHER);
    uint256 amount = ACTIVATION_THRESHOLD - EJECTION_THRESHOLD + 1;
    staking.slash(ATTESTER, amount);

    vm.expectRevert(abi.encodeWithSelector(Errors.Staking__InitiateWithdrawNeeded.selector, ATTESTER));
    staking.finalizeWithdraw(ATTESTER);
  }

  modifier givenStatusIsExiting() {
    // We deposit and initiate a withdraw

    mint(address(this), ACTIVATION_THRESHOLD);
    stakingAsset.approve(address(staking), ACTIVATION_THRESHOLD);

    staking.deposit({
      _attester: ATTESTER,
      _withdrawer: WITHDRAWER,
      _publicKeyInG1: BN254Lib.g1Zero(),
      _publicKeyInG2: BN254Lib.g2Zero(),
      _proofOfPossession: BN254Lib.g1Zero(),
      _moveWithLatestRollup: true
    });
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
    staking.finalizeWithdraw(ATTESTER);
  }

  function test_GivenTimeIsAfterUnlock(bool _claimedFromGov) external givenStatusIsExiting {
    // it deletes the exit
    // it deletes the operator info
    // it transfer funds to recipient
    // it emits a {WithdrawFinalized} event

    AttesterView memory attesterView = staking.getAttesterView(ATTESTER);
    assertTrue(attesterView.status == Status.EXITING);
    assertEq(attesterView.exit.exitableAt, Timestamp.wrap(block.timestamp) + staking.getExitDelay());
    assertEq(attesterView.exit.isRecipient, true);
    assertEq(attesterView.exit.recipientOrWithdrawer, RECIPIENT);

    vm.warp(Timestamp.unwrap(attesterView.exit.exitableAt));

    if (_claimedFromGov) {
      staking.getGSE().getGovernance().finalizeWithdraw(0);
    }

    address lookup = _claimedFromGov ? address(staking) : address(staking.getGSE().getGovernance());

    assertEq(stakingAsset.balanceOf(lookup), ACTIVATION_THRESHOLD);
    assertEq(stakingAsset.balanceOf(RECIPIENT), 0);

    vm.expectEmit(true, true, true, true, address(staking));
    emit IStakingCore.WithdrawFinalized(ATTESTER, RECIPIENT, ACTIVATION_THRESHOLD);
    staking.finalizeWithdraw(ATTESTER);

    attesterView = staking.getAttesterView(ATTESTER);
    assertEq(attesterView.exit.recipientOrWithdrawer, address(0));
    assertEq(attesterView.exit.exitableAt, Timestamp.wrap(0));
    assertTrue(attesterView.status == Status.NONE);

    assertEq(stakingAsset.balanceOf(lookup), 0);
    assertEq(stakingAsset.balanceOf(RECIPIENT), ACTIVATION_THRESHOLD);
  }
}
