// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

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

  function add(User storage _self, uint256 _amount) internal {
    if (_amount == 0) {
      return;
    }
    uint224 current = _self.checkpoints.latest();
    _self.checkpoints.push(block.timestamp.toUint32(), current + _amount.toUint224());
  }

  function sub(User storage _self, uint256 _amount) internal {
    if (_amount == 0) {
      return;
    }
    uint224 current = _self.checkpoints.latest();
    uint224 amount = _amount.toUint224();
    require(current >= amount, Errors.Governance__InsufficientPower(msg.sender, current, amount));
    _self.checkpoints.push(block.timestamp.toUint32(), current - amount);
  }

  function powerNow(User storage _self) internal view returns (uint256) {
    return _self.checkpoints.latest();
  }

  function powerAt(User storage _self, Timestamp _time) internal view returns (uint256) {
    // If not in the past, the values are not stable. We disallow using it to avoid potential misuse.
    require(_time < Timestamp.wrap(block.timestamp), Errors.Governance__UserLib__NotInPast());
    return _self.checkpoints.upperLookup(Timestamp.unwrap(_time).toUint32());
  }
}
