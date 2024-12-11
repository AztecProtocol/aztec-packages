// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {UserLibBase} from "./base.t.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {UserLib} from "@aztec/governance/libraries/UserLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

contract PowerNowTest is UserLibBase {
  using UserLib for DataStructures.User;

  Timestamp internal time;

  function test_GivenNoCheckpoints(uint256 _time) external {
    // it return 0
    vm.warp(_time);
    assertEq(user.powerNow(), 0);
  }

  function test_GivenCheckpoints(
    bool[CHECKPOINT_COUNT] memory _insert,
    uint8[CHECKPOINT_COUNT] memory _timeBetween,
    uint16[CHECKPOINT_COUNT] memory _amounts,
    uint32 _timeJump
  ) external givenUserHaveCheckpoints(_insert, _timeBetween, _amounts) {
    // it return power at last checkpoint

    vm.warp(block.timestamp + _timeJump);

    assertEq(user.powerNow(), user.checkpoints[user.numCheckPoints - 1].power);
  }
}
