// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {Timestamp} from "@aztec/shared/libraries/TimeMath.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

/**
 * @title CheckpointedUintLib
 * @notice  Library for managing Trace224 using a timestamp as key,
 *          Provides helper functions to `add` to or `sub` from the current value.
 */
library CheckpointedUintLib {
  using Checkpoints for Checkpoints.Trace224;
  using SafeCast for uint256;

  /**
   * @notice  Add `_amount` to the current value
   *
   * @dev   The amounts are cast to uint224 before storing such that the (key: value) fits in a single slot
   *
   * @param _self - The Trace224 to add to
   * @param _amount - The amount to add
   *
   * @return - The current value and the new value
   */
  function add(Checkpoints.Trace224 storage _self, uint256 _amount) internal returns (uint256, uint256) {
    uint224 current = _self.latest();
    if (_amount == 0) {
      return (current, current);
    }
    uint224 amount = _amount.toUint224();
    _self.push(block.timestamp.toUint32(), current + amount);
    return (current, current + amount);
  }

  /**
   * @notice  Subtract `_amount` from the current value
   *
   * @param _self - The Trace224 to subtract from
   * @param _amount - The amount to subtract
   * @return - The current value and the new value
   */
  function sub(Checkpoints.Trace224 storage _self, uint256 _amount) internal returns (uint256, uint256) {
    uint224 current = _self.latest();
    if (_amount == 0) {
      return (current, current);
    }
    uint224 amount = _amount.toUint224();
    require(current >= amount, Errors.Governance__CheckpointedUintLib__InsufficientValue(msg.sender, current, amount));
    _self.push(block.timestamp.toUint32(), current - amount);
    return (current, current - amount);
  }

  /**
   * @notice  Get the current value
   *
   * @param _self - The Trace224 to get the value of
   * @return - The current value
   */
  function valueNow(Checkpoints.Trace224 storage _self) internal view returns (uint256) {
    return _self.latest();
  }

  /**
   * @notice  Get the value at a given timestamp
   *          The timestamp MUST be in the past to guarantee it is stable
   *
   * @dev     Uses `upperLookupRecent` instead of just `upperLookup` as it will most
   *          likely be a recent value when looked up as part of governance.
   *
   * @param _self - The Trace224 to get the value of
   * @param _time - The timestamp to get the value at
   * @return - The value at the given timestamp
   */
  function valueAt(Checkpoints.Trace224 storage _self, Timestamp _time) internal view returns (uint256) {
    require(_time < Timestamp.wrap(block.timestamp), Errors.Governance__CheckpointedUintLib__NotInPast());
    return _self.upperLookupRecent(Timestamp.unwrap(_time).toUint32());
  }
}
