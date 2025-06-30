// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {
  CompressedFeeHeader,
  FeeHeader,
  FeeHeaderLib
} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Slot} from "@aztec/shared/libraries/TimeMath.sol";

/**
 * @notice Struct for storing block data, set in proposal.
 * @param archive - Archive tree root of the block
 * @param headerHash - Hash of the proposed block header
 * @param blobCommitmentsHash - H(...H(H(commitment_0), commitment_1).... commitment_n) - used to validate we are using the same blob commitments on L1 and in the rollup circuit
 * @param slotNumber - This block's slot
 */
struct BlockLog {
  bytes32 archive;
  bytes32 headerHash;
  bytes32 blobCommitmentsHash;
  Slot slotNumber;
  FeeHeader feeHeader;
}

struct TempBlockLog {
  bytes32 headerHash;
  bytes32 blobCommitmentsHash;
  Slot slotNumber;
  FeeHeader feeHeader;
}

struct CompressedTempBlockLog {
  bytes32 headerHash;
  bytes32 blobCommitmentsHash;
  CompressedSlot slotNumber;
  CompressedFeeHeader feeHeader;
}

library CompressedTempBlockLogLib {
  using CompressedTimeMath for Slot;
  using CompressedTimeMath for CompressedSlot;
  using FeeHeaderLib for FeeHeader;
  using FeeHeaderLib for CompressedFeeHeader;

  function compress(TempBlockLog memory _blockLog)
    internal
    pure
    returns (CompressedTempBlockLog memory)
  {
    return CompressedTempBlockLog({
      headerHash: _blockLog.headerHash,
      blobCommitmentsHash: _blockLog.blobCommitmentsHash,
      slotNumber: _blockLog.slotNumber.compress(),
      feeHeader: _blockLog.feeHeader.compress()
    });
  }

  function decompress(CompressedTempBlockLog memory _compressedBlockLog)
    internal
    pure
    returns (TempBlockLog memory)
  {
    return TempBlockLog({
      headerHash: _compressedBlockLog.headerHash,
      blobCommitmentsHash: _compressedBlockLog.blobCommitmentsHash,
      slotNumber: _compressedBlockLog.slotNumber.decompress(),
      feeHeader: _compressedBlockLog.feeHeader.decompress()
    });
  }
}
