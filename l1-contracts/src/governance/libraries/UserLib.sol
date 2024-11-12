// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

library UserLib {
  function add(DataStructures.User storage _self, uint256 _amount) internal {
    if (_amount == 0) {
      return;
    }
    if (_self.numCheckPoints == 0) {
      _self.checkpoints[0] =
        DataStructures.CheckPoint({time: Timestamp.wrap(block.timestamp), power: _amount});
      _self.numCheckPoints += 1;
    } else {
      DataStructures.CheckPoint storage last = _self.checkpoints[_self.numCheckPoints - 1];
      if (last.time == Timestamp.wrap(block.timestamp)) {
        last.power += _amount;
      } else {
        _self.checkpoints[_self.numCheckPoints] = DataStructures.CheckPoint({
          time: Timestamp.wrap(block.timestamp),
          power: last.power + _amount
        });
        _self.numCheckPoints += 1;
      }
    }
  }

  function sub(DataStructures.User storage _self, uint256 _amount) internal {
    if (_amount == 0) {
      return;
    }
    require(_self.numCheckPoints > 0, Errors.Governance__NoCheckpointsFound());
    DataStructures.CheckPoint storage last = _self.checkpoints[_self.numCheckPoints - 1];
    require(
      last.power >= _amount, Errors.Governance__InsufficientPower(msg.sender, last.power, _amount)
    );
    if (last.time == Timestamp.wrap(block.timestamp)) {
      last.power -= _amount;
    } else {
      _self.checkpoints[_self.numCheckPoints] = DataStructures.CheckPoint({
        time: Timestamp.wrap(block.timestamp),
        power: last.power - _amount
      });
      _self.numCheckPoints += 1;
    }
  }

  function powerNow(DataStructures.User storage _self) internal view returns (uint256) {
    uint256 numCheckPoints = _self.numCheckPoints;
    if (numCheckPoints == 0) {
      return 0;
    }
    return _self.checkpoints[numCheckPoints - 1].power;
  }

  function powerAt(DataStructures.User storage _self, Timestamp _time)
    internal
    view
    returns (uint256)
  {
    // If not in the past, the values are not stable.
    // We disallow using it to avoid potential misuse.
    require(_time < Timestamp.wrap(block.timestamp), Errors.Governance__UserLib__NotInPast());

    uint256 numCheckPoints = _self.numCheckPoints;
    if (numCheckPoints == 0) {
      return 0;
    }

    if (_self.checkpoints[numCheckPoints - 1].time <= _time) {
      return _self.checkpoints[numCheckPoints - 1].power;
    }

    if (_self.checkpoints[0].time > _time) {
      return 0;
    }

    uint256 lower = 0;
    uint256 upper = numCheckPoints - 1;
    while (upper > lower) {
      uint256 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
      DataStructures.CheckPoint memory cp = _self.checkpoints[center];
      if (cp.time == _time) {
        return cp.power;
      } else if (cp.time < _time) {
        lower = center;
      } else {
        upper = center - 1;
      }
    }
    return _self.checkpoints[lower].power;
  }
}
