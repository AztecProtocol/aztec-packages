// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {CheckpointedUintLibBase} from "./base.t.sol";
import {Checkpoints, CheckpointedUintLib} from "@aztec/governance/libraries/CheckpointedUintLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

contract PowerAtTest is CheckpointedUintLibBase {
  using CheckpointedUintLib for Checkpoints.Trace224;
  using Checkpoints for Checkpoints.Trace224;
  using SafeCast for uint256;

  Timestamp internal time;

  function test_WhenTimeNotInPast() external {
    // it revert
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__CheckpointedUintLib__NotInPast.selector));
    this.callPowerAt();
  }

  // @dev helper for testing, to avoid:
  // "call didn't revert at a lower depth than cheatcode call depth"
  function callPowerAt() external view {
    user.valueAt(Timestamp.wrap(block.timestamp));
  }

  modifier whenTimeInPast() {
    time = Timestamp.wrap(1e6);
    vm.warp(Timestamp.unwrap(time) + 12);

    _;
  }

  function test_GivenNoCheckpoints() external whenTimeInPast {
    // it return 0
    assertEq(user.valueAt(time), 0);
  }

  function test_WhenTimeLtFirstCheckpoint(
    bool[CHECKPOINT_COUNT] memory _insert,
    uint8[CHECKPOINT_COUNT] memory _timeBetween,
    uint16[CHECKPOINT_COUNT] memory _amounts
  ) external whenTimeInPast givenUserHaveCheckpoints(_insert, _timeBetween, _amounts) {
    // it return 0

    assertEq(user.valueAt(time), 0, "non-zero power");
    assertGt(user.valueNow(), 0, "insufficient power");
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

    uint32 index = bound(_index, 0, user.length() - (_between ? 2 : 1)).toUint32();

    Checkpoints.Checkpoint224 memory first = user.at(index);

    if (_between) {
      Checkpoints.Checkpoint224 memory second = user.at(index + 1);
      time = Timestamp.wrap(first._key) + Timestamp.wrap((second._key - first._key) / 2);
    } else {
      if (index == user.length() && _index % 2 == 0) {
        time = Timestamp.wrap(block.timestamp - 12);
      } else {
        time = Timestamp.wrap(first._key);
      }
    }

    assertEq(user.valueAt(time), first._value);
    assertGt(first._value, 0);
  }
}
