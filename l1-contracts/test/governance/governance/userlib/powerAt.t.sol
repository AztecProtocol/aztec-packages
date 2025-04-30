// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {UserLibBase} from "./base.t.sol";
import {User, UserLib} from "@aztec/governance/libraries/UserLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

contract PowerAtTest is UserLibBase {
  using UserLib for User;
  using Checkpoints for Checkpoints.Trace224;
  using SafeCast for uint256;

  Timestamp internal time;

  function test_WhenTimeNotInPast() external {
    // it revert
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__UserLib__NotInPast.selector));
    this.callPowerAt();
  }

  // @dev helper for testing, to avoid:
  // "call didn't revert at a lower depth than cheatcode call depth"
  function callPowerAt() external view {
    user.powerAt(Timestamp.wrap(block.timestamp));
  }

  modifier whenTimeInPast() {
    time = Timestamp.wrap(1e6);
    vm.warp(Timestamp.unwrap(time) + 12);

    _;
  }

  function test_GivenNoCheckpoints() external whenTimeInPast {
    // it return 0
    assertEq(user.powerAt(time), 0);
  }

  function test_WhenTimeLtFirstCheckpoint(
    bool[CHECKPOINT_COUNT] memory _insert,
    uint8[CHECKPOINT_COUNT] memory _timeBetween,
    uint16[CHECKPOINT_COUNT] memory _amounts
  ) external whenTimeInPast givenUserHaveCheckpoints(_insert, _timeBetween, _amounts) {
    // it return 0

    assertEq(user.powerAt(time), 0, "non-zero power");
    assertGt(user.powerNow(), 0, "insufficient power");
  }

  function test_WhenTimeGeFirstCheckpoint(
    bool[CHECKPOINT_COUNT] memory _insert,
    uint8[CHECKPOINT_COUNT] memory _timeBetween,
    uint16[CHECKPOINT_COUNT] memory _amounts,
    uint256 _index,
    bool _between
  ) external whenTimeInPast givenUserHaveCheckpoints(_insert, _timeBetween, _amounts) {
    // it return power at last checkpoint with time < time

    if (insertions == 1) {
      vm.warp(block.timestamp + 12);
      user.add(1);
    }

    vm.warp(block.timestamp + 12);

    uint32 index = bound(_index, 0, user.checkpoints.length() - (_between ? 2 : 1)).toUint32();

    Checkpoints.Checkpoint224 memory first = user.checkpoints.at(index);

    if (_between) {
      Checkpoints.Checkpoint224 memory second = user.checkpoints.at(index + 1);
      time = Timestamp.wrap(first._key) + Timestamp.wrap((second._key - first._key) / 2);
    } else {
      if (index == user.checkpoints.length() && _index % 2 == 0) {
        time = Timestamp.wrap(block.timestamp - 12);
      } else {
        time = Timestamp.wrap(first._key);
      }
    }

    assertEq(user.powerAt(time), first._value);
    assertGt(first._value, 0);
  }
}
