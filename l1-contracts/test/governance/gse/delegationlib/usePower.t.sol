// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {Test} from "forge-std/Test.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

import {DelegationLibWrapper} from "./DelegationLibWrapper.sol";

contract UsePowerTest is Test {
  DelegationLibWrapper internal delegationLib = new DelegationLibWrapper();

  function test_GivenPowerUsedPlusAmountGtPowerAt(
    address _delegatee,
    uint256 _proposalId,
    uint32 _timestamp,
    uint256 _amount,
    uint256 _powerAt
  ) external {
    // it reverts
    vm.assume(_delegatee != address(0));

    uint256 powerAt = bound(_powerAt, 0, type(uint128).max - 1);
    uint256 preAmount = bound(_amount, 0, powerAt);
    uint256 amount = bound(_amount, powerAt - preAmount + 1, type(uint128).max);
    uint256 timestamp = bound(_timestamp, block.timestamp + 1, type(uint32).max);

    // Increase the balance and delegate to self
    delegationLib.increaseBalance(address(this), _delegatee, powerAt);
    delegationLib.delegate(address(this), _delegatee, _delegatee);
    assertEq(delegationLib.getBalanceOf(address(this), _delegatee), powerAt, "invalid balance");
    assertEq(delegationLib.getVotingPower(_delegatee), powerAt, "invalid voting power");

    vm.warp(timestamp);

    // We use the pre-amount handle non-zero starting points as well
    if (preAmount > 0) {
      delegationLib.usePower(_delegatee, _proposalId, Timestamp.wrap(timestamp - 1), preAmount);
    }

    // At this point, we expect a failure when we are trying to vote with move than we have available
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Delegation__InsufficientPower.selector, _delegatee, powerAt, preAmount + amount
      )
    );
    delegationLib.usePower(_delegatee, _proposalId, Timestamp.wrap(timestamp - 1), amount);
  }

  function test_GivenPowerUsedPlusAmountLePowerAt(
    address _delegatee,
    uint256[2] memory _proposalIds,
    uint32 _timestamp,
    uint256 _amount,
    uint256 _powerAt
  ) external {
    // it updates power used for proposal
    vm.assume(_proposalIds[0] != _proposalIds[1]);
    vm.assume(_delegatee != address(0));

    uint256 powerAt = bound(_powerAt, 1, type(uint128).max);
    uint256 amount = bound(_amount, 0, powerAt);
    uint256 timestamp = bound(_timestamp, block.timestamp + 1, type(uint32).max);

    // Increase the balance and delegate to self
    delegationLib.increaseBalance(address(this), _delegatee, powerAt);
    delegationLib.delegate(address(this), _delegatee, _delegatee);
    assertEq(delegationLib.getBalanceOf(address(this), _delegatee), powerAt);
    assertEq(delegationLib.getVotingPower(_delegatee), powerAt);

    vm.warp(timestamp);

    // Show that we can vote, and that we can vote on different proposals without hitting a failure.
    vm.record();
    delegationLib.usePower(_delegatee, _proposalIds[0], Timestamp.wrap(timestamp - 1), amount);
    (, bytes32[] memory writeSlots) = vm.accesses(address(delegationLib));
    assertEq(writeSlots.length, 1);
    assertEq(delegationLib.getPowerUsed(_delegatee, _proposalIds[0]), amount);

    delegationLib.usePower(_delegatee, _proposalIds[1], Timestamp.wrap(timestamp - 1), amount);
    assertEq(delegationLib.getPowerUsed(_delegatee, _proposalIds[1]), amount);
  }
}
