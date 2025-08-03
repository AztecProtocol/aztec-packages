// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {WithDelegationLib} from "./base.sol";

contract DecreaseBalanceTest is WithDelegationLib {
  function test_WhenAmountEq0(address _instance, address _attester) external {
    // it alters no state

    vm.record();
    delegationLib.decreaseBalance(_instance, _attester, 0);
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
    // it decrease balance by amount
    // it decrease instance supply by amount
    // it decrease supply by amount

    address instance = _instances[0];
    vm.assume(instance != _instances[1]);

    uint256 balance = bound(_balance, 1, type(uint128).max);
    uint256 amount = bound(_amount, 1, balance);
    delegationLib.increaseBalance(instance, _attester, balance);

    vm.warp(block.timestamp + 1);

    vm.record();
    delegationLib.decreaseBalance(instance, _attester, amount);
    assertNumWrites(1, 2);
    // We call sstore 5 times.
    // 1 to reduce the balance of the user
    // 2 to reduce the instance supply and update the number of snapshots
    // 2 to reduce the supply and update the number of snapshots

    assertEq(delegationLib.getBalanceOf(instance, _attester), balance - amount);
    assertEq(delegationLib.getBalanceOf(_instances[1], _attester), 0);
    assertEq(delegationLib.getVotingPower(_attester), 0);
    assertEq(delegationLib.getSupplyOf(instance), balance - amount);
    assertEq(delegationLib.getSupplyOf(_instances[1]), 0);
    assertEq(delegationLib.getSupply(), balance - amount);
    assertEq(delegationLib.getDelegatee(instance, _attester), address(0));
    assertEq(delegationLib.getDelegatee(_instances[1], _attester), address(0));
  }

  function test_GivenADelegatee(
    address[2] memory _instances,
    address _attester,
    address _delegatee,
    uint256 _amount,
    uint256 _balance
  ) external whenAmountGt0 {
    // it decrease balance by amount
    // it decrease the voting power of the delegatee by amount
    // it decrease instance supply by amount
    // it decrease supply by amount

    address instance = _instances[0];
    vm.assume(instance != _instances[1]);

    vm.assume(_delegatee != address(0));

    uint256 balance = bound(_balance, 1, type(uint128).max);
    uint256 amount = bound(_amount, 1, balance);
    delegationLib.increaseBalance(instance, _attester, balance);
    delegationLib.delegate(instance, _attester, _delegatee);

    assertEq(delegationLib.getBalanceOf(instance, _attester), balance);
    assertEq(delegationLib.getVotingPower(_delegatee), balance);

    vm.warp(block.timestamp + 1);

    vm.record();
    delegationLib.decreaseBalance(instance, _attester, amount);
    assertNumWrites(1, 3);
    // We call sstore 7 times.
    // 1 to reduce the balance of the user
    // 2 to reduce the voting power and update the number of snapshots
    // 2 to reduce the instance supply and update the number of snapshots
    // 2 to reduce the supply and update the number of snapshots

    assertEq(delegationLib.getBalanceOf(instance, _attester), balance - amount);
    assertEq(delegationLib.getBalanceOf(_instances[1], _attester), 0);
    assertEq(delegationLib.getVotingPower(_delegatee), balance - amount);
    assertEq(delegationLib.getSupplyOf(instance), balance - amount);
    assertEq(delegationLib.getSupplyOf(_instances[1]), 0);
    assertEq(delegationLib.getSupply(), balance - amount);
    assertEq(delegationLib.getDelegatee(instance, _attester), _delegatee);
    assertEq(delegationLib.getDelegatee(_instances[1], _attester), address(0));
  }
}
