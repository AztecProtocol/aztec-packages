// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  RewardBooster,
  RewardBoostConfig,
  ActivityScore,
  CompressedActivityScore
} from "@aztec/core/reward-boost/RewardBooster.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {CompressedTimeMath, CompressedEpoch} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";

contract BoostedHelper is RewardBooster {
  using SafeCast for uint256;
  using CompressedTimeMath for Epoch;

  constructor(IValidatorSelection _rollup, RewardBoostConfig memory _config)
    RewardBooster(_rollup, _config)
  {}

  // Usually we would be using cheatcodes directly, but with this in particular, it seems like the cheatcodes
  // is not having a good time and we end up overflowing it. Therefore we just update it directly instead
  function setActivityScore(address _prover, uint256 _value) public {
    activityScores[_prover] =
      CompressedActivityScore({value: _value.toUint32(), time: ROLLUP.getCurrentEpoch().compress()});
  }
}
