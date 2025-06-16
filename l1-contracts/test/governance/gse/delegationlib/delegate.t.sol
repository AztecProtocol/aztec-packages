// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {DelegationLibWrapper} from "./DelegationLibWrapper.sol";

import {WithDelegationLib} from "./base.sol";

contract DelegateTest is WithDelegationLib {
  function test_WhenNewDelegateeEqOldDelegatee(
    address _instance,
    address _attester,
    address _newDelegatee
  ) external {
    // it changes no state

    vm.assume(_newDelegatee != address(0));

    delegationLib.increaseBalance(_instance, _attester, 100);
    delegationLib.delegate(_instance, _attester, _newDelegatee);
    assertEq(delegationLib.getDelegatee(_instance, _attester), _newDelegatee);
    assertEq(delegationLib.getVotingPower(_newDelegatee), 100);
    assertEq(delegationLib.getVotingPower(_attester), 0);
    assertEq(delegationLib.getSupplyOf(_instance), 100);
    assertEq(delegationLib.getSupply(), 100);
    assertEq(delegationLib.getBalanceOf(_instance, _attester), 100);

    vm.record();
    delegationLib.delegate(_instance, _attester, _newDelegatee);
    assertNumWrites(0, 0);
  }

  modifier whenNewDelegateeNeqOldDelegatee() {
    _;
  }

  function test_GivenOldDelegateeEq0(
    address _instance,
    address _attester,
    address _newDelegatee,
    uint256 _balance
  ) external whenNewDelegateeNeqOldDelegatee {
    // it updates the delegatee
    // it increases power of the new delegatee

    vm.assume(_newDelegatee != address(0));

    uint256 balance = bound(_balance, 1, type(uint128).max);

    delegationLib.increaseBalance(_instance, _attester, balance);

    vm.warp(block.timestamp + 1);

    vm.record();
    delegationLib.delegate(_instance, _attester, _newDelegatee);
    assertNumWrites(1, 1);
    // We call sstore 3 times.
    // 1 to update the delegatee
    // 2 to increase the voting power and update the number of snapshots

    assertEq(delegationLib.getDelegatee(_instance, _attester), _newDelegatee);
    assertEq(delegationLib.getVotingPower(_newDelegatee), balance);
    assertEq(delegationLib.getVotingPower(_attester), 0);
    assertEq(delegationLib.getSupplyOf(_instance), balance);
    assertEq(delegationLib.getSupply(), balance);
    assertEq(delegationLib.getBalanceOf(_instance, _attester), balance);
  }

  function test_WhenNewDelegateeEq0(
    address _instance,
    address _attester,
    address _tempDelegatee,
    uint256 _balance
  ) external whenNewDelegateeNeqOldDelegatee {
    // it updates the delegatee
    // it decreases power of the old delegatee
    vm.assume(_tempDelegatee != address(0));

    uint256 balance = bound(_balance, 1, type(uint128).max);
    address newDelegatee = address(0);

    delegationLib.increaseBalance(_instance, _attester, balance);
    delegationLib.delegate(_instance, _attester, _tempDelegatee);

    vm.warp(block.timestamp + 1);

    vm.record();
    delegationLib.delegate(_instance, _attester, newDelegatee);
    assertNumWrites(1, 1);
    // We call sstore 3 times.
    // 1 to update the delegatee
    // 2 to decrease the voting power and update the number of snapshots

    assertEq(delegationLib.getDelegatee(_instance, _attester), newDelegatee);
    assertEq(delegationLib.getVotingPower(newDelegatee), 0);
    assertEq(delegationLib.getVotingPower(_tempDelegatee), 0);
    assertEq(delegationLib.getSupplyOf(_instance), balance);
    assertEq(delegationLib.getSupply(), balance);
    assertEq(delegationLib.getBalanceOf(_instance, _attester), balance);
  }

  function test_WhenNeitherDelegateeEq0(
    address[2] memory _instances,
    address _attester,
    address _oldDelegatee,
    address _newDelegatee,
    uint256 _balance
  ) external whenNewDelegateeNeqOldDelegatee {
    // it updates the delegatee
    // it decreases power of the old delegatee
    // it increases power of the new delegatee

    vm.assume(_oldDelegatee != address(0));
    vm.assume(_newDelegatee != address(0));
    vm.assume(_oldDelegatee != _newDelegatee);

    address instance = _instances[0];
    vm.assume(instance != _instances[1]);

    uint256 balance = bound(_balance, 1, type(uint128).max);

    delegationLib.increaseBalance(instance, _attester, balance);
    delegationLib.delegate(instance, _attester, _oldDelegatee);

    assertEq(delegationLib.getDelegatee(instance, _attester), _oldDelegatee);
    assertEq(delegationLib.getVotingPower(_oldDelegatee), balance);
    assertEq(delegationLib.getVotingPower(_attester), 0);
    assertEq(delegationLib.getSupplyOf(instance), balance);
    assertEq(delegationLib.getSupply(), balance);
    assertEq(delegationLib.getBalanceOf(instance, _attester), balance);

    vm.warp(block.timestamp + 1);

    vm.record();
    delegationLib.delegate(instance, _attester, _newDelegatee);
    assertNumWrites(1, 2);
    // We call sstore 5 times.
    // 1 to update the delegatee
    // 2 to decrease the voting power and update the number of snapshots
    // 2 to increase the voting power and update the number of snapshots

    assertEq(delegationLib.getDelegatee(instance, _attester), _newDelegatee);
    assertEq(delegationLib.getDelegatee(_instances[1], _attester), address(0));
    assertEq(delegationLib.getVotingPower(_newDelegatee), balance);
    assertEq(delegationLib.getVotingPower(_oldDelegatee), 0);
    assertEq(delegationLib.getSupplyOf(instance), balance);
    assertEq(delegationLib.getSupplyOf(_instances[1]), 0);
    assertEq(delegationLib.getSupply(), balance);
    assertEq(delegationLib.getBalanceOf(instance, _attester), balance);
    assertEq(delegationLib.getBalanceOf(_instances[1], _attester), 0);
  }
}
