// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {ApellaBase} from "./base.t.sol";
import {IApella} from "@aztec/governance/interfaces/IApella.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {ConfigurationLib} from "@aztec/governance/libraries/ConfigurationLib.sol";

contract InitiateWithdrawTest is ApellaBase {
  using ConfigurationLib for DataStructures.Configuration;

  uint256 internal constant WITHDRAWAL_COUNT = 8;
  DataStructures.Configuration internal config;

  modifier whenCallerHaveInsufficientDeposits() {
    _;
  }

  function test_GivenNoCheckpoints(uint256 _amount) external whenCallerHaveInsufficientDeposits {
    // it revert
    uint256 amount = bound(_amount, 1, type(uint256).max);
    vm.expectRevert(abi.encodeWithSelector(Errors.Apella__NoCheckpointsFound.selector));
    apella.initiateWithdraw(address(this), amount);
  }

  function test_GivenCheckpoints(uint256 _depositAmount, uint256 _withdrawalAmount)
    external
    whenCallerHaveInsufficientDeposits
  {
    // it revert
    uint256 depositAmount = bound(_depositAmount, 1, type(uint128).max);
    uint256 withdrawalAmount = bound(_withdrawalAmount, depositAmount + 1, type(uint256).max);

    token.mint(address(this), depositAmount);
    token.approve(address(apella), depositAmount);
    apella.deposit(address(this), depositAmount);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Apella__InsufficientPower.selector, address(this), depositAmount, withdrawalAmount
      )
    );
    apella.initiateWithdraw(address(this), withdrawalAmount);
  }

  function test_WhenCallerHaveSufficientDeposits(
    uint256 _depositAmount,
    address[WITHDRAWAL_COUNT] memory _recipient,
    uint256[WITHDRAWAL_COUNT] memory _withdrawals,
    uint256[WITHDRAWAL_COUNT] memory _timejumps
  ) external {
    // it sub snapshot to user
    // it sub snapshot to total
    // it creates a pending withdrawal with time of unlock
    // it emits {WithdrawalInitiated} event

    uint256 deposit = _depositAmount;
    uint256 sum = deposit;
    uint256 withdrawalId = 0;

    token.mint(address(this), deposit);
    token.approve(address(apella), deposit);
    apella.deposit(address(this), deposit);
    assertEq(token.balanceOf(address(apella)), deposit);

    config = apella.getConfiguration();

    for (uint256 i = 0; i < WITHDRAWAL_COUNT; i++) {
      address recipient = i % 2 == 0 ? _recipient[i] : address(0xdeadbeef);
      uint256 amount = bound(_withdrawals[i], 0, sum);
      uint256 timeJump = bound(_timejumps[i], 1, type(uint32).max);

      if (amount == 0) {
        continue;
      }

      sum -= amount;
      vm.warp(block.timestamp + timeJump);

      vm.expectEmit(true, true, true, true, address(apella));
      emit IApella.WithdrawInitiated(withdrawalId, recipient, amount);
      apella.initiateWithdraw(recipient, amount);

      DataStructures.Withdrawal memory withdrawal = apella.getWithdrawal(withdrawalId);
      assertEq(withdrawal.amount, amount, "invalid amount");
      assertEq(
        withdrawal.unlocksAt,
        Timestamp.wrap(block.timestamp) + config.lockDelay(),
        "Invalid timestamp"
      );
      assertEq(withdrawal.recipient, recipient, "invalid recipient");
      assertFalse(withdrawal.claimed, "already claimed");
      assertEq(apella.totalPowerAt(Timestamp.wrap(block.timestamp)), sum);

      withdrawalId++;

      assertEq(apella.withdrawalCount(), withdrawalId);
    }
    assertEq(token.balanceOf(address(apella)), deposit);
  }
}
