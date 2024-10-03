// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {DataStructures} from "@aztec/governance/libraries/DataStructures.sol";
import {Timestamp} from "@aztec/core/libraries/TimeMath.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";

library UserLib {
  function add(DataStructures.User storage self, uint256 _amount) internal {
    if (_amount == 0) {
      return;
    }
    if (self.numCheckPoints == 0) {
      self.checkpoints[0] =
        DataStructures.CheckPoint({time: Timestamp.wrap(block.timestamp), power: _amount});
      self.numCheckPoints += 1;
    } else {
      DataStructures.CheckPoint storage last = self.checkpoints[self.numCheckPoints - 1];
      if (last.time == Timestamp.wrap(block.timestamp)) {
        last.power += _amount;
      } else {
        self.checkpoints[self.numCheckPoints] = DataStructures.CheckPoint({
          time: Timestamp.wrap(block.timestamp),
          power: last.power + _amount
        });
        self.numCheckPoints += 1;
      }
    }
  }

  function sub(DataStructures.User storage self, uint256 _amount) internal {
    if (_amount == 0) {
      return;
    }
    require(self.numCheckPoints > 0, Errors.Apella__NoCheckpointsFound());
    DataStructures.CheckPoint storage last = self.checkpoints[self.numCheckPoints - 1];
    require(last.power >= _amount, Errors.Apella__InsufficientPower(last.power, _amount));
    if (last.time == Timestamp.wrap(block.timestamp)) {
      last.power -= _amount;
    } else {
      self.checkpoints[self.numCheckPoints] = DataStructures.CheckPoint({
        time: Timestamp.wrap(block.timestamp),
        power: last.power - _amount
      });
      self.numCheckPoints += 1;
    }
  }

  function powerNow(DataStructures.User storage self) internal view returns (uint256) {
    uint256 numCheckPoints = self.numCheckPoints;
    if (numCheckPoints == 0) {
      return 0;
    }
    return self.checkpoints[numCheckPoints - 1].power;
  }

  function powerAt(DataStructures.User storage self, Timestamp _time)
    internal
    view
    returns (uint256)
  {
    // If not in the past, the values are not stable.
    // We disallow using it to avoid potential misuse.
    require(_time < Timestamp.wrap(block.timestamp), Errors.Apella__NotInPast());

    uint256 numCheckPoints = self.numCheckPoints;
    if (numCheckPoints == 0) {
      return 0;
    }

    if (self.checkpoints[numCheckPoints - 1].time <= _time) {
      return self.checkpoints[numCheckPoints - 1].power;
    }

    if (self.checkpoints[0].time > _time) {
      return 0;
    }

    uint256 lower = 0;
    uint256 upper = numCheckPoints - 1;
    while (upper > lower) {
      uint256 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
      DataStructures.CheckPoint memory cp = self.checkpoints[center];
      if (cp.time == _time) {
        return cp.power;
      } else if (cp.time < _time) {
        lower = center;
      } else {
        upper = center - 1;
      }
    }
    return self.checkpoints[lower].power;
  }
}
