// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

uint32 constant DEPOSIT_GRANULARITY_SECONDS = 1;

struct User {
  Checkpoints.Trace224 checkpoints;
}

/**
 * @title UserLib
 * @notice Library for managing user power
 * Using timestamp to uint32 to fit neatly with the Trace224 struct. We see this as sane
 * because the governance can upgrade itself and will hopefully have figured out something better
 * by then.
 */
library UserLib {
  using Checkpoints for Checkpoints.Trace224;
  using SafeCast for uint256;

  function add(User storage _self, uint256 _amount) internal returns (uint256, uint256) {
    uint224 current = _self.checkpoints.latest();
    if (_amount == 0) {
      return (current, current);
    }
    uint224 amount = _amount.toUint224();
    _self.checkpoints.push(toDepositCheckpoint(Timestamp.wrap(block.timestamp)), current + amount);
    return (current, current + amount);
  }

  function sub(User storage _self, uint256 _amount) internal returns (uint256, uint256) {
    uint224 current = _self.checkpoints.latest();
    if (_amount == 0) {
      return (current, current);
    }
    uint224 amount = _amount.toUint224();
    require(current >= amount, Errors.Governance__InsufficientPower(msg.sender, current, amount));
    _self.checkpoints.push(toDepositCheckpoint(Timestamp.wrap(block.timestamp)), current - amount);
    return (current, current - amount);
  }

  function powerNow(User storage _self) internal view returns (uint256) {
    return _self.checkpoints.latest();
  }

  function powerAt(User storage _self, Timestamp _time) internal view returns (uint256) {
    uint32 requestedCheckpoint = toDepositCheckpoint(_time);
    uint32 currentCheckpoint = toDepositCheckpoint(Timestamp.wrap(block.timestamp));
    // If not in the past, the values are not stable. We disallow using it to avoid potential misuse.
    require(requestedCheckpoint < currentCheckpoint, Errors.Governance__UserLib__NotInPast());
    return _self.checkpoints.upperLookupRecent(requestedCheckpoint);
  }

  function toDepositCheckpoint(Timestamp _timestamp) internal pure returns (uint32) {
    return (Timestamp.unwrap(_timestamp) / DEPOSIT_GRANULARITY_SECONDS).toUint32();
  }

  function toTimestamp(uint32 _checkpoint) internal pure returns (Timestamp) {
    return Timestamp.wrap(_checkpoint * DEPOSIT_GRANULARITY_SECONDS);
  }
}
