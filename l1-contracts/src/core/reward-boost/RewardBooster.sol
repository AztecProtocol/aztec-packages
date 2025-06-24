// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

struct RewardBoostConfig {
  uint32 increment;
  uint32 maxScore;
  uint32 a; // a
  uint32 minimum; // m
  uint32 k; // k
}

struct ActivityScore {
  Epoch time;
  uint32 value;
}

interface IBoosterCore {
  function updateAndGetShares(address _prover) external returns (uint256);
  function getSharesFor(address _prover) external view returns (uint256);
}

interface IBooster is IBoosterCore {
  function getConfig() external view returns (RewardBoostConfig memory);
  function getActivityScore(address _prover) external view returns (ActivityScore memory);
}

/**
 * @title RewardBooster
 *
 * @notice  Abstracts the accounting related to rewards boosting from the POV of the rollup.
 */
contract RewardBooster is IBooster {
  using SafeCast for uint256;

  IValidatorSelection public immutable ROLLUP;
  uint256 private immutable CONFIG_INCREMENT;
  uint256 private immutable CONFIG_MAX_SCORE;
  uint256 private immutable CONFIG_A;
  uint256 private immutable CONFIG_MINIMUM;
  uint256 private immutable CONFIG_K;

  mapping(address prover => ActivityScore) public activityScores;

  modifier onlyRollup() {
    require(msg.sender == address(ROLLUP), Errors.RewardBooster__OnlyRollup(msg.sender));
    _;
  }

  constructor(IValidatorSelection _rollup, RewardBoostConfig memory _config) {
    ROLLUP = _rollup;

    CONFIG_INCREMENT = _config.increment;
    CONFIG_MAX_SCORE = _config.maxScore;
    CONFIG_A = _config.a;
    CONFIG_MINIMUM = _config.minimum;
    CONFIG_K = _config.k;
  }

  function updateAndGetShares(address _prover)
    external
    override(IBoosterCore)
    onlyRollup
    returns (uint256)
  {
    Epoch currentEpoch = ROLLUP.getCurrentEpoch();

    ActivityScore storage store = activityScores[_prover];
    ActivityScore memory curr = _activityScoreAt(store, currentEpoch);

    // If the score was alrady marked active in this epoch, ignore the addition.
    if (curr.time != store.time) {
      store.value = Math.min(curr.value + CONFIG_INCREMENT, CONFIG_MAX_SCORE).toUint32();
      store.time = curr.time;
    }

    return _toShares(store.value);
  }

  function getConfig() external view override(IBooster) returns (RewardBoostConfig memory) {
    return RewardBoostConfig({
      increment: CONFIG_INCREMENT.toUint32(),
      maxScore: CONFIG_MAX_SCORE.toUint32(),
      a: CONFIG_A.toUint32(),
      minimum: CONFIG_MINIMUM.toUint32(),
      k: CONFIG_K.toUint32()
    });
  }

  function getSharesFor(address _prover) external view override(IBoosterCore) returns (uint256) {
    return _toShares(getActivityScore(_prover).value);
  }

  function getActivityScore(address _prover)
    public
    view
    override(IBooster)
    returns (ActivityScore memory)
  {
    return _activityScoreAt(activityScores[_prover], ROLLUP.getCurrentEpoch());
  }

  function _activityScoreAt(ActivityScore storage _score, Epoch _epoch)
    internal
    view
    returns (ActivityScore memory)
  {
    uint256 decrease = (Epoch.unwrap(_epoch) - Epoch.unwrap(_score.time)) * 1e5;
    return ActivityScore({
      value: decrease > uint256(_score.value) ? 0 : _score.value - decrease.toUint32(),
      time: _epoch
    });
  }

  function _toShares(uint256 _value) internal view returns (uint256) {
    if (_value > CONFIG_MAX_SCORE) {
      return CONFIG_K;
    }
    uint256 t = (CONFIG_MAX_SCORE - _value);
    uint256 rhs = CONFIG_A * t * t / 1e10;

    // Sub would move us below 0
    if (CONFIG_K < rhs) {
      return CONFIG_MINIMUM;
    }

    return Math.max(CONFIG_K - rhs, CONFIG_MINIMUM);
  }
}
