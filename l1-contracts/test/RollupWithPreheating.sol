// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Rollup, GenesisState, RollupConfigInput} from "@aztec/core/Rollup.sol";
import {IERC20} from "@aztec/core/interfaces/IRollup.sol";
import {IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {GSE} from "@aztec/governance/GSE.sol";
import {IVerifier} from "@aztec/core/interfaces/IVerifier.sol";
import {STFLib, RollupStore, RollupCore} from "@aztec/core/RollupCore.sol";
import {CompressedFeeHeader, FeeHeaderLib} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {
  CompressedTempCheckpointLogLib,
  TempCheckpointLog,
  CompressedTempCheckpointLog
} from "@aztec/core/libraries/compressed-data/CheckpointLog.sol";
import {Slot} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

/**
 * @title RollupWithPreheating
 * @author Aztec Labs
 * @notice Extension of the Rollup contract that includes preheating functionality for testing purposes.
 */
contract RollupWithPreheating is Rollup {
  using CompressedTempCheckpointLogLib for TempCheckpointLog;
  using FeeHeaderLib for CompressedFeeHeader;

  constructor(
    IERC20 _feeAsset,
    IERC20 _stakingAsset,
    GSE _gse,
    IVerifier _epochProofVerifier,
    address _governance,
    GenesisState memory _genesisState,
    RollupConfigInput memory _config
  ) Rollup(_feeAsset, _stakingAsset, _gse, _epochProofVerifier, _governance, _genesisState, _config) {
    preheatHeaders();
  }

  /**
   * @notice Preheats the temporary checkpoint log storage with non-zero values to optimize gas costs for accurate
   * benchmarking
   * @dev Iterates through all slots in the circular storage and replaces zero values with 0x1
   *      to avoid expensive SSTORE operations when transitioning from zero to non-zero values.
   *      This is a gas optimization technique used primarily for benchmarking and testing.
   *
   *      Special handling for slot 0: The slot number remains 0 for the first slot as it's
   *      used in "already in chain" checks where 0 has semantic meaning.
   *
   *      Reverts if storage has already been preheated to prevent double-initialization.
   */
  function preheatHeaders() internal {
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
   * @dev Internal helper function to access fee headers from STFLib
   * @param _checkpointNumber The checkpoint number to get the fee header for
   * @return The compressed fee header containing fee-related data
   */
  function _getFeeHeader(uint256 _checkpointNumber) internal view returns (CompressedFeeHeader) {
    return STFLib.getFeeHeader(_checkpointNumber);
  }
}
