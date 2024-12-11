// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {UserLibBase} from "./base.t.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {UserLib} from "@aztec/governance/libraries/UserLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract PowerAtTest is UserLibBase {
  using UserLib for DataStructures.User;

  Timestamp internal time;

  function test_WhenTimeNotInPast() external {
    // it revert
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__UserLib__NotInPast.selector));
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

    uint256 index = bound(_index, 0, user.numCheckPoints - (_between ? 2 : 1));

    DataStructures.CheckPoint memory first = user.checkpoints[index];

    if (_between) {
      DataStructures.CheckPoint memory second = user.checkpoints[index + 1];
      time = first.time + Timestamp.wrap(Timestamp.unwrap(second.time - first.time) / 2);
    } else {
      if (index == user.numCheckPoints && _index % 2 == 0) {
        time = Timestamp.wrap(block.timestamp - 12);
      } else {
        time = first.time;
      }
    }

    assertEq(user.powerAt(time), first.power);
    assertGt(first.power, 0);
  }
}
