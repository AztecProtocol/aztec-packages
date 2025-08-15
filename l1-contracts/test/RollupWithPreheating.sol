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
import {TempBlockLog, CompressedTempBlockLog} from "@aztec/core/libraries/compressed-data/BlockLog.sol";
import {CompressedTempBlockLogLib} from "@aztec/core/libraries/compressed-data/BlockLog.sol";
import {Slot} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

/**
 * @title RollupWithPreheating
 * @author Aztec Labs
 * @notice Extension of the Rollup contract that includes preheating functionality for testing purposes.
 */
contract RollupWithPreheating is Rollup {
  using CompressedTempBlockLogLib for TempBlockLog;
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
   * @notice Preheats the temporary block log storage with non-zero values to optimize gas costs for accurate
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
      TempBlockLog memory blockLog = CompressedTempBlockLogLib.decompress(store.tempBlockLogs[i]);

      // DO NOT PREHEAT slot for 0, because there the value 0 is actually meaningful.
      // It is being used in the already in chain checks.
      if (i > 0 && blockLog.slotNumber == Slot.wrap(0)) {
        blockLog.slotNumber = Slot.wrap(1);
      }

      if (blockLog.headerHash == bytes32(0)) {
        blockLog.headerHash = bytes32(uint256(0x1));
      }

      if (blockLog.blobCommitmentsHash == bytes32(0)) {
        blockLog.blobCommitmentsHash = bytes32(uint256(0x1));
      }

      if (blockLog.attestationsHash == bytes32(0)) {
        blockLog.attestationsHash = bytes32(uint256(0x1));
      }

      if (blockLog.payloadDigest == bytes32(0)) {
        blockLog.payloadDigest = bytes32(uint256(0x1));
      }

      store.tempBlockLogs[i] = CompressedTempBlockLogLib.compress(blockLog);
    }
  }

  /**
   * @notice Calculates the size of the circular storage buffer for temporary block logs
   * @dev Internal helper function to access the roundabout size from STFLib
   * @return The number of slots in the circular storage buffer
   */
  function _roundaboutSize() internal view returns (uint256) {
    return STFLib.roundaboutSize();
  }

  /**
   * @notice Retrieves the compressed fee header for a specific block number
   * @dev Internal helper function to access fee headers from STFLib
   * @param _blockNumber The block number to get the fee header for
   * @return The compressed fee header containing fee-related data
   */
  function _getFeeHeader(uint256 _blockNumber) internal view returns (CompressedFeeHeader) {
    return STFLib.getFeeHeader(_blockNumber);
  }
}
