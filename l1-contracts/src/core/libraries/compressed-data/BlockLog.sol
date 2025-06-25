// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

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
}

struct CompressedBlockLog {
  bytes32 archive;
  bytes32 headerHash;
  bytes32 blobCommitmentsHash;
  CompressedSlot slotNumber;
}

library BlockLogLib {
  using CompressedTimeMath for Slot;
  using CompressedTimeMath for CompressedSlot;

  function compress(BlockLog memory _blockLog) internal pure returns (CompressedBlockLog memory) {
    return CompressedBlockLog({
      archive: _blockLog.archive,
      headerHash: _blockLog.headerHash,
      blobCommitmentsHash: _blockLog.blobCommitmentsHash,
      slotNumber: _blockLog.slotNumber.compress()
    });
  }

  function decompress(CompressedBlockLog memory _compressedBlockLog)
    internal
    pure
    returns (BlockLog memory)
  {
    return BlockLog({
      archive: _compressedBlockLog.archive,
      headerHash: _compressedBlockLog.headerHash,
      blobCommitmentsHash: _compressedBlockLog.blobCommitmentsHash,
      slotNumber: _compressedBlockLog.slotNumber.decompress()
    });
  }
}
