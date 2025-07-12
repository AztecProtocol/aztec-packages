// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {WithDelegationLib} from "./base.sol";
import {DEPOSIT_GRANULARITY_SECONDS} from "@aztec/governance/libraries/UserLib.sol";

contract IncreaseBalanceTest is WithDelegationLib {
  function test_WhenAmountEq0(address _instance, address _attester) external {
    // it alters no state

    vm.record();
    delegationLib.increaseBalance(_instance, _attester, 0);
    assertNumWrites(0, 0);
  }

  modifier whenAmountGt0() {
    _;
  }

  function test_GivenNoDelegatee(
    address[2] memory _instances,
    address _attester,
    uint256 _amount,
    uint256 _balance
  ) external whenAmountGt0 {
    // it increase balance by amount
    // it increase instance supply by amount
    // it increase supply by amount

    address instance = _instances[0];
    vm.assume(instance != _instances[1]);

    uint256 balance = bound(_balance, 1, type(uint64).max);
    uint256 amount = bound(_amount, 1, type(uint64).max);

    delegationLib.increaseBalance(instance, _attester, balance);

    vm.warp(block.timestamp + DEPOSIT_GRANULARITY_SECONDS);

    vm.record();
    delegationLib.increaseBalance(instance, _attester, amount);
    assertNumWrites(1, 2);
    // We call sstore 5 times.
    // 1 to increase the balance of the user
    // 2 to increase the instance supply and update the number of snapshots
    // 2 to increase the supply and update the number of snapshots

    assertEq(delegationLib.getBalanceOf(instance, _attester), balance + amount);
    assertEq(delegationLib.getBalanceOf(_instances[1], _attester), 0);
    assertEq(delegationLib.getVotingPower(_attester), 0);
    assertEq(delegationLib.getSupplyOf(instance), balance + amount);
    assertEq(delegationLib.getSupplyOf(_instances[1]), 0);
    assertEq(delegationLib.getSupply(), balance + amount);
    assertEq(delegationLib.getDelegatee(instance, _attester), address(0));
  }

  function test_GivenADelegatee(
    address[2] memory _instances,
    address _attester,
    address _delegatee,
    uint256 _amount,
    uint256 _balance
  ) external whenAmountGt0 {
    // it increase balance by amount
    // it increase the voting power of the delegatee by amount
    // it increase instance supply by amount
    // it increase supply by amount

    address instance = _instances[0];
    vm.assume(instance != _instances[1]);

    vm.assume(_delegatee != address(0));

    uint256 balance = bound(_balance, 1, type(uint64).max);
    uint256 amount = bound(_amount, 1, type(uint64).max);
    delegationLib.increaseBalance(instance, _attester, balance);
    delegationLib.delegate(instance, _attester, _delegatee);

    assertEq(delegationLib.getBalanceOf(instance, _attester), balance);
    assertEq(delegationLib.getVotingPower(_delegatee), balance);

    vm.warp(block.timestamp + DEPOSIT_GRANULARITY_SECONDS);

    vm.record();
    delegationLib.increaseBalance(instance, _attester, amount);
    assertNumWrites(1, 3);
    // We call sstore 7 times.
    // 1 to increase the balance of the user
    // 2 to increase the voting power and update the number of snapshots
    // 2 to increase the instance supply and update the number of snapshots
    // 2 to increase the supply and update the number of snapshots

    assertEq(delegationLib.getBalanceOf(instance, _attester), balance + amount);
    assertEq(delegationLib.getBalanceOf(_instances[1], _attester), 0);
    assertEq(delegationLib.getVotingPower(_delegatee), balance + amount);
    assertEq(delegationLib.getSupplyOf(instance), balance + amount);
    assertEq(delegationLib.getSupplyOf(_instances[1]), 0);
    assertEq(delegationLib.getSupply(), balance + amount);
    assertEq(delegationLib.getDelegatee(instance, _attester), _delegatee);
    assertEq(delegationLib.getDelegatee(_instances[1], _attester), address(0));
  }
}
