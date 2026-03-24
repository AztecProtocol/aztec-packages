// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Rollup, GenesisState, RollupConfigInput} from "@aztec/core/Rollup.sol";
import {Economics} from "@aztec/core/Economics.sol";
import {IEconomics} from "@aztec/core/interfaces/IEconomics.sol";
import {IERC20} from "@aztec/core/interfaces/IRollup.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {STFLib, RollupStore, RollupCore} from "@aztec/core/RollupCore.sol";
import {CompressedFeeHeader, FeeHeader, FeeHeaderLib} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {
  CompressedTempCheckpointLogLib,
  TempCheckpointLog,
  CompressedTempCheckpointLog
} from "@aztec/core/libraries/compressed-data/CheckpointLog.sol";
import {EconomicsInitArgs} from "@aztec/core/libraries/rollup/EconomicsTypes.sol";
import {Epoch, Slot, TimeLib, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

contract PreheatedEconomics is Economics {
  using FeeHeaderLib for CompressedFeeHeader;

  constructor(address _governance, address _rollup, IERC20 _feeAsset, EconomicsInitArgs memory _init)
    Economics(_governance, _rollup, _feeAsset, _init)
  {
    CompressedFeeHeader genesisFeeHeader = _getPricingParentFeeHeader(0);
    uint256 size = TimeLib.maxPrunableCheckpoints() + 1;
    for (uint256 checkpointNumber = 1; checkpointNumber <= size; checkpointNumber++) {
      _writeFeeHeader(checkpointNumber, genesisFeeHeader.decompress());
    }
  }
}

/**
 * @title RollupWithPreheating
 * @author Aztec Labs
 * @notice Extension of the Rollup contract that includes preheating functionality for testing purposes.
 */
contract RollupWithPreheating is Rollup {
  using Checkpoints for Checkpoints.Trace160;
  using CompressedTempCheckpointLogLib for TempCheckpointLog;
  using FeeHeaderLib for CompressedFeeHeader;
  using FeeHeaderLib for FeeHeader;
  using TimeLib for Epoch;

  constructor(
    IERC20 _feeAsset,
    IERC20 _stakingAsset,
    GSE _gse,
    IVerifier _epochProofVerifier,
    address _governance,
    GenesisState memory _genesisState,
    RollupConfigInput memory _config
  ) Rollup(_feeAsset, _stakingAsset, _gse, _epochProofVerifier, _governance, _genesisState, _config) {
    preheatHeaders(_feeAsset, _config);
  }

  function preheatHeaders(IERC20 _feeAsset, RollupConfigInput memory _config) internal {
    _preheatTempCheckpointLogs();
    _replaceWithPreheatedEconomics(_feeAsset, _config);
  }

  /**
   * @notice Preheats the temporary checkpoint log storage with non-zero values to optimize gas costs for accurate
   * benchmarking.
   * @dev Iterates through all slots in the circular storage and replaces zero values with 0x1
   *      to avoid expensive SSTORE operations when transitioning from zero to non-zero values.
   *
   *      Special handling for slot 0: The slot number remains 0 for the first slot as it's
   *      used in "already in chain" checks where 0 has semantic meaning.
   */
  function _preheatTempCheckpointLogs() internal {
    // Need to ensure that we have not already heated everything!
    uint256 size = _roundaboutSize();

    RollupStore storage store = STFLib.getStorage();

    for (uint256 i = 0; i < size; i++) {
      TempCheckpointLog memory checkpointLog = CompressedTempCheckpointLogLib.decompress(store.tempCheckpointLogs[i]);

      // DO NOT PREHEAT slot for 0, because there the value 0 is actually meaningful.
      // It is being used in the already in chain checks.
      if (i > 0 && checkpointLog.slotNumber == Slot.wrap(0)) {
        checkpointLog.slotNumber = Slot.wrap(1);
      }

      if (checkpointLog.headerHash == bytes32(0)) {
        checkpointLog.headerHash = bytes32(uint256(0x1));
      }

      if (checkpointLog.blobCommitmentsHash == bytes32(0)) {
        checkpointLog.blobCommitmentsHash = bytes32(uint256(0x1));
      }

      if (checkpointLog.attestationsHash == bytes32(0)) {
        checkpointLog.attestationsHash = bytes32(uint256(0x1));
      }

      if (checkpointLog.payloadDigest == bytes32(0)) {
        checkpointLog.payloadDigest = bytes32(uint256(0x1));
      }

      store.tempCheckpointLogs[i] = CompressedTempCheckpointLogLib.compress(checkpointLog);
    }
  }

  function _replaceWithPreheatedEconomics(IERC20 _feeAsset, RollupConfigInput memory _config) internal {
    RollupStore storage store = STFLib.getStorage();
    IEconomics economics = IEconomics(address(store.economicsCheckpoints.latest()));
    IEconomics preheatedEconomics = IEconomics(
      address(
        new PreheatedEconomics(
          owner(),
          address(this),
          _feeAsset,
          EconomicsInitArgs({
            manaTarget: economics.getFeeConfig().manaTarget,
            provingCostPerMana: economics.getFeeConfig().provingCostPerMana,
            initialEthPerFeeAsset: _config.initialEthPerFeeAsset,
            rewardConfig: economics.getRewardConfig(),
            rewardBoostConfig: economics.getRewardBoostConfig(),
            genesisTime: Timestamp.unwrap(economics.getGenesisTime()),
            aztecSlotDuration: economics.getSlotDuration(),
            aztecEpochDuration: economics.getEpochDuration(),
            aztecProofSubmissionEpochs: economics.getProofSubmissionEpochs()
          })
        )
      )
    );

    store.economicsCheckpoints
      .push(uint96(Timestamp.unwrap(Epoch.wrap(0).toTimestamp())), uint160(address(preheatedEconomics)));
  }

  /**
   * @notice Calculates the size of the circular storage buffer for temporary checkpoint logs
   * @dev Internal helper function to access the roundabout size from STFLib
   * @return The number of slots in the circular storage buffer
   */
  function _roundaboutSize() internal view returns (uint256) {
    return STFLib.roundaboutSize();
  }

  /**
   * @notice Retrieves the compressed fee header for a specific checkpoint number
   * @dev Internal helper function to access fee headers from the economics model active for that checkpoint's epoch.
   * @param _checkpointNumber The checkpoint number to get the fee header for
   * @return The compressed fee header containing fee-related data
   */
  function _getFeeHeader(uint256 _checkpointNumber) internal view returns (CompressedFeeHeader) {
    IEconomics economics = IEconomics(address(this.getEconomicsForEpoch(this.getEpochForCheckpoint(_checkpointNumber))));
    return economics.getFeeHeader(_checkpointNumber).compress();
  }
}
