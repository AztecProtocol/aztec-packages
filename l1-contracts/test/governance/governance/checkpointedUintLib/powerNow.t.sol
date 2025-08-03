// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {CheckpointedUintLibBase} from "./base.t.sol";
import {Checkpoints, CheckpointedUintLib} from "@aztec/governance/libraries/CheckpointedUintLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

contract PowerNowTest is CheckpointedUintLibBase {
  using CheckpointedUintLib for Checkpoints.Trace224;
  using Checkpoints for Checkpoints.Trace224;

  Timestamp internal time;

  function test_GivenNoCheckpoints(uint64 _time) external {
    // it return 0
    vm.warp(_time);
    assertEq(user.valueNow(), 0);
  }

  function test_GivenCheckpoints(
    bool[CHECKPOINT_COUNT] memory _insert,
    uint8[CHECKPOINT_COUNT] memory _timeBetween,
    uint16[CHECKPOINT_COUNT] memory _amounts,
    uint32 _timeJump
  ) external givenUserHaveCheckpoints(_insert, _timeBetween, _amounts) {
    // it return power at last checkpoint

    vm.warp(block.timestamp + _timeJump);

    assertEq(user.valueNow(), user.latest());
  }
}
