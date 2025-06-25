// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {WithGSE} from "./base.sol";
import {Withdrawal} from "@aztec/governance/interfaces/IGovernance.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";

contract FinaliseHelperTest is WithGSE {
  uint256 internal withdrawalId;

  address internal ATTESTER = address(0xcafe);
  address internal INSTANCE = address(0xbeef);
  address internal WITHDRAWER = address(0xdead);

  function setUp() public override {
    super.setUp();

    vm.prank(gse.owner());
    gse.addRollup(INSTANCE);

    cheat_deposit(INSTANCE, ATTESTER, WITHDRAWER, false);

    vm.prank(INSTANCE);
    (,, withdrawalId) = gse.withdraw(ATTESTER, 100);
  }

  function test_GivenWithdrawalNotClaimed() external {
    // it finalises withdrawal in governance

    Withdrawal memory withdrawal = governance.getWithdrawal(withdrawalId);

    vm.warp(Timestamp.unwrap(withdrawal.unlocksAt));

    assertEq(stakingAsset.balanceOf(INSTANCE), 0);

    gse.finaliseHelper(withdrawalId);

    assertEq(stakingAsset.balanceOf(INSTANCE), 100);
    withdrawal = governance.getWithdrawal(withdrawalId);
    assertEq(withdrawal.claimed, true);
  }

  function test_GivenWithdrawalAlreadyClaimed() external {
    // it does nothing

    Withdrawal memory withdrawal = governance.getWithdrawal(withdrawalId);
    vm.warp(Timestamp.unwrap(withdrawal.unlocksAt));
    assertEq(stakingAsset.balanceOf(INSTANCE), 0);

    gse.finaliseHelper(withdrawalId);

    assertEq(stakingAsset.balanceOf(INSTANCE), 100);
    withdrawal = governance.getWithdrawal(withdrawalId);
    assertEq(withdrawal.claimed, true);

    vm.record();
    gse.finaliseHelper(withdrawalId);
    (, bytes32[] memory writes) = vm.accesses(address(gse));
    assertEq(writes.length, 0);
  }
}
