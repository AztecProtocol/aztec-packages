// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {UserLibBase} from "./base.t.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {UserLib} from "@aztec/governance/libraries/UserLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";

contract AddTest is UserLibBase {
  using UserLib for DataStructures.User;

  function test_WhenAmountEq0() external {
    // it return instantly with no changes

    assertEq(user.numCheckPoints, 0);

    vm.record();
    user.add(0);
    (bytes32[] memory reads, bytes32[] memory writes) = vm.accesses(address(this));

    assertEq(user.numCheckPoints, 0);
    assertEq(reads.length, 0);
    assertEq(writes.length, 0);
  }

  function test_GivenUserHaveNoCheckpoints(uint256 _amount, uint256 _time)
    external
    whenAmountGt0(_amount)
  {
    // it adds checkpoint with amount
    // it increases num checkpoints

    assertEq(user.numCheckPoints, 0);

    vm.warp(_time);
    user.add(amount);

    assertEq(user.numCheckPoints, 1);
    assertEq(user.checkpoints[0].time, Timestamp.wrap(_time));
    assertEq(user.checkpoints[0].power, amount);
  }

  function test_WhenLastCheckpointIsNow(
    uint256 _amount,
    bool[CHECKPOINT_COUNT] memory _insert,
    uint8[CHECKPOINT_COUNT] memory _timeBetween,
    uint16[CHECKPOINT_COUNT] memory _amounts
  ) external whenAmountGt0(_amount) givenUserHaveCheckpoints(_insert, _timeBetween, _amounts) {
    // it increases power by amount

    assertEq(user.numCheckPoints, insertions, "num checkpoints");
    // Cache in memory
    DataStructures.CheckPoint memory last = user.checkpoints[user.numCheckPoints - 1];

    user.add(amount);

    assertEq(user.numCheckPoints, insertions, "num checkpoints");
    DataStructures.CheckPoint memory last2 = user.checkpoints[user.numCheckPoints - 1];

    assertEq(last2.time, last.time, "time");
    assertEq(last2.power, last.power + amount, "power");
  }

  function test_WhenLastCheckpointInPast(
    uint256 _amount,
    bool[CHECKPOINT_COUNT] memory _insert,
    uint8[CHECKPOINT_COUNT] memory _timeBetween,
    uint16[CHECKPOINT_COUNT] memory _amounts,
    uint256 _time
  ) external whenAmountGt0(_amount) givenUserHaveCheckpoints(_insert, _timeBetween, _amounts) {
    // it adds a checkpoint with power eq to last.power + amount
    // it increases num checkpoints

    uint256 time = bound(_time, 1, type(uint32).max);

    assertEq(user.numCheckPoints, insertions);
    // Cache in memory
    DataStructures.CheckPoint memory last = user.checkpoints[user.numCheckPoints - 1];

    vm.warp(block.timestamp + time);
    user.add(amount);

    assertEq(user.numCheckPoints, insertions + 1);
    DataStructures.CheckPoint memory last2 = user.checkpoints[user.numCheckPoints - 1];

    assertEq(last2.time, last.time + Timestamp.wrap(time));
    assertEq(last2.power, last.power + amount);
  }
}
