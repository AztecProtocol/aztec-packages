// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {GovernanceBase} from "./base.t.sol";
import {
  IGovernance, Configuration, Withdrawal
} from "@aztec/governance/interfaces/IGovernance.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {ConfigurationLib} from "@aztec/governance/libraries/ConfigurationLib.sol";

contract InitiateWithdrawTest is GovernanceBase {
  using ConfigurationLib for Configuration;

  uint256 internal constant WITHDRAWAL_COUNT = 8;
  Configuration internal config;

  modifier whenCallerHaveInsufficientDeposits() {
    _;
  }

  function test_GivenNoCheckpoints(uint256 _amount) external whenCallerHaveInsufficientDeposits {
    // it revert
    uint256 amount = bound(_amount, 1, type(uint224).max);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__InsufficientPower.selector, address(this), 0, amount
      )
    );
    governance.initiateWithdraw(address(this), amount);
  }

  function test_GivenCheckpoints(uint256 _depositAmount, uint256 _withdrawalAmount)
    external
    whenCallerHaveInsufficientDeposits
  {
    // it revert
    uint256 depositAmount = bound(_depositAmount, 1, type(uint128).max);
    uint256 withdrawalAmount = bound(_withdrawalAmount, depositAmount + 1, type(uint224).max);

    token.mint(address(this), depositAmount);
    token.approve(address(governance), depositAmount);
    governance.deposit(address(this), depositAmount);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Governance__InsufficientPower.selector,
        address(this),
        depositAmount,
        withdrawalAmount
      )
    );
    governance.initiateWithdraw(address(this), withdrawalAmount);
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

    uint256 deposit = bound(_depositAmount, 1, type(uint224).max);
    uint256 sum = deposit;
    uint256 withdrawalId = 0;

    token.mint(address(this), deposit);
    token.approve(address(governance), deposit);
    governance.deposit(address(this), deposit);
    assertEq(token.balanceOf(address(governance)), deposit);

    config = governance.getConfiguration();

    for (uint256 i = 0; i < WITHDRAWAL_COUNT; i++) {
      address recipient = i % 2 == 0 ? _recipient[i] : address(0xdeadbeef);
      uint256 amount = bound(_withdrawals[i], 0, sum);
      uint256 timeJump = bound(_timejumps[i], 1, type(uint16).max);

      if (amount == 0) {
        continue;
      }

      sum -= amount;
      vm.warp(block.timestamp + timeJump);

      vm.expectEmit(true, true, true, true, address(governance));
      emit IGovernance.WithdrawInitiated(withdrawalId, recipient, amount);
      governance.initiateWithdraw(recipient, amount);

      Withdrawal memory withdrawal = governance.getWithdrawal(withdrawalId);
      assertEq(withdrawal.amount, amount, "invalid amount");
      assertEq(
        withdrawal.unlocksAt,
        Timestamp.wrap(block.timestamp) + config.withdrawalDelay(),
        "Invalid timestamp"
      );
      assertEq(withdrawal.recipient, recipient, "invalid recipient");
      assertFalse(withdrawal.claimed, "already claimed");
      assertEq(governance.totalPowerAt(Timestamp.wrap(block.timestamp)), sum);

      withdrawalId++;

      assertEq(governance.withdrawalCount(), withdrawalId);
    }
    assertEq(token.balanceOf(address(governance)), deposit);
  }
}
