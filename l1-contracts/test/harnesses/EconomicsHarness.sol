// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Economics} from "@aztec/core/Economics.sol";
import {CompressedFeeConfig, FeeConfigLib} from "@aztec/core/libraries/compressed-data/fees/FeeConfig.sol";
import {FeeHeader, FeeHeaderLib} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {CompressedActivityScore, EconomicsInitArgs} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {Epoch, Slot, TimeLib, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

contract EconomicsHarness is Economics {
  using FeeHeaderLib for FeeHeader;
  using FeeConfigLib for CompressedFeeConfig;
  using SafeCast for uint256;
  using TimeLib for Timestamp;
  using CompressedTimeMath for Epoch;

  constructor(address _governance, address _rollup, IERC20 _feeAsset, EconomicsInitArgs memory _init)
    Economics(_governance, _rollup, _feeAsset, _init)
  {}

  function setActivityScore(address _prover, uint256 _value) external {
    rewardState.activityScores[_prover] = CompressedActivityScore({
      value: _value.toUint32(), time: Timestamp.wrap(block.timestamp).epochFromTimestamp().compress()
    });
  }

  function applyBoosterUpdate(address _prover) external returns (uint256) {
    return _updateAndGetShares(_prover);
  }

  function setFeeHeader(uint256 _checkpointNumber, FeeHeader memory _feeHeader) external {
    require(_checkpointNumber > 0, "checkpoint 0 is not stored");
    if (feeState.firstRecordedCheckpoint == 0 || _checkpointNumber < feeState.firstRecordedCheckpoint) {
      feeState.firstRecordedCheckpoint = _checkpointNumber.toUint128();
    }
    if (_checkpointNumber > feeState.highestRecordedCheckpoint) {
      feeState.highestRecordedCheckpoint = _checkpointNumber.toUint128();
    }
    _writeFeeHeader(_checkpointNumber, _feeHeader);
  }

  function settleCheckpointFees(uint256 _checkpointNumber, bytes32 _feeField)
    external
    view
    returns (uint256 burn, uint256 proverFee, uint256 sequencerFee)
  {
    return _settleCheckpointFees(_checkpointNumber, _feeField);
  }

  function computeManaLimit(uint256 _manaTarget) external pure returns (uint256) {
    return _computeManaLimit(_manaTarget);
  }

  function computeNewEthPerFeeAsset(uint256 _currentPrice, int256 _modifierBps) external pure returns (uint256) {
    return _computeNewEthPerFeeAsset(_currentPrice, _modifierBps);
  }

  function congestionMultiplier(uint256 _numerator) external view returns (uint256) {
    return _congestionMultiplier(_numerator);
  }

  function clampedAdd(uint256 _a, int256 _b) external pure returns (uint256) {
    return _clampedAdd(_a, _b);
  }

  function getCurrentSlot() external view returns (Slot) {
    return Timestamp.wrap(block.timestamp).slotFromTimestamp();
  }
}
