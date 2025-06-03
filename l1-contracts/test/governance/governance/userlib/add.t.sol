// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {UserLibBase} from "./base.t.sol";
import {User, UserLib} from "@aztec/governance/libraries/UserLib.sol";
import {Timestamp, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

contract AddTest is UserLibBase {
  using UserLib for User;
  using Checkpoints for Checkpoints.Trace224;
  using TimeLib for Timestamp;
  using SafeCast for uint256;

  function test_WhenAmountEq0() external {
    // it return instantly with no changes

    assertEq(user.checkpoints.length(), 0);

    vm.record();
    user.add(0);
    (bytes32[] memory reads, bytes32[] memory writes) = vm.accesses(address(this));

    assertEq(user.checkpoints.length(), 0);
    assertEq(reads.length, 1);
    assertEq(writes.length, 0);
  }

  function test_GivenUserHaveNoCheckpoints(uint256 _amount, uint32 _time)
    external
    whenAmountGt0(_amount)
  {
    // it adds checkpoint with amount
    // it increases num checkpoints

    assertEq(user.checkpoints.length(), 0);

    vm.warp(_time);
    user.add(amount);

    assertEq(user.checkpoints.length(), 1);
    Checkpoints.Checkpoint224 memory last = user.checkpoints.at(0);
    assertEq(last._key, _time);
    assertEq(last._value, amount.toUint224());
  }

  function test_WhenLastCheckpointIsNow(
    uint256 _amount,
    bool[CHECKPOINT_COUNT] memory _insert,
    uint8[CHECKPOINT_COUNT] memory _timeBetween,
    uint16[CHECKPOINT_COUNT] memory _amounts
  ) external whenAmountGt0(_amount) givenUserHaveCheckpoints(_insert, _timeBetween, _amounts) {
    // it increases power by amount

    assertEq(user.checkpoints.length(), insertions, "num checkpoints");
    // Cache in memory
    Checkpoints.Checkpoint224 memory last = user.checkpoints.at(uint32(insertions - 1));

    user.add(amount);

    assertEq(user.checkpoints.length(), insertions, "num checkpoints");
    Checkpoints.Checkpoint224 memory last2 = user.checkpoints.at(uint32(insertions - 1));

    assertEq(last2._key, last._key, "key");
    assertEq(last2._value, last._value + amount.toUint224(), "power");
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

    uint256 time = bound(_time, 1, type(uint16).max);

    assertEq(user.checkpoints.length(), insertions);
    // Cache in memory
    Checkpoints.Checkpoint224 memory last = user.checkpoints.at(uint32(insertions - 1));

    vm.warp(block.timestamp + time);
    user.add(amount);

    assertEq(user.checkpoints.length(), insertions + 1);
    Checkpoints.Checkpoint224 memory last2 = user.checkpoints.at(uint32(insertions));

    assertEq(last2._key, last._key + time.toUint32());
    assertEq(last2._value, last._value + amount);
  }
}
