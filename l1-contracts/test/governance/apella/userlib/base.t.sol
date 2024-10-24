// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {TestBase} from "@test/base/Base.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {UserLib} from "@aztec/governance/libraries/UserLib.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";

contract UserLibBase is TestBase {
  using UserLib for DataStructures.User;

  uint256 internal constant CHECKPOINT_COUNT = 8;

  DataStructures.User internal user;

  uint256 internal amount;
  uint256 internal sumBefore;
  uint256 internal insertions;

  modifier whenAmountGt0(uint256 _amount) {
    amount = bound(_amount, 1, type(uint128).max);
    _;
  }

  modifier givenUserHaveCheckpoints(
    bool[CHECKPOINT_COUNT] memory _insert,
    uint8[CHECKPOINT_COUNT] memory _timeBetween,
    uint16[CHECKPOINT_COUNT] memory _amounts
  ) {
    for (uint256 i = 0; i < CHECKPOINT_COUNT; i++) {
      if (_insert[i] || (i > CHECKPOINT_COUNT / 2 && insertions == 0)) {
        vm.warp(block.timestamp + bound(_timeBetween[i], 1, type(uint16).max));
        uint256 p = bound(_amounts[i], 1, type(uint16).max);
        user.add(p);
        sumBefore += p;
        insertions += 1;
      }
    }

    _;
  }
}
