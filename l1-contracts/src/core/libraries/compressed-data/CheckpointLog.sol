// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {CompressedFeeHeader, FeeHeader, FeeHeaderLib} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";
import {Slot} from "@aztec/shared/libraries/TimeMath.sol";

/**
 * @notice Struct for storing checkpoint data, set in proposal.
 * @param archive - Archive tree root of the checkpoint
 * @param headerHash - Hash of the proposed checkpoint header
 * @param blobCommitmentsHash - H(...H(H(commitment_0), commitment_1).... commitment_n) - used to validate we are using
 * the same blob commitments on L1 and in the rollup circuit
 * @param attestationsHash - Hash of the attestations for this checkpoint
 * @param payloadDigest - Digest of the proposal payload that was attested to
 * @param slotNumber - This checkpoint's slot
 */
struct CheckpointLog {
  bytes32 archive;
  bytes32 headerHash;
  bytes32 blobCommitmentsHash;
  bytes32 outHash;
  bytes32 attestationsHash;
  bytes32 payloadDigest;
  Slot slotNumber;
  FeeHeader feeHeader;
}

struct TempCheckpointLog {
  bytes32 headerHash;
  bytes32 blobCommitmentsHash;
  bytes32 outHash;
  bytes32 attestationsHash;
  bytes32 payloadDigest;
  Slot slotNumber;
  FeeHeader feeHeader;
}

struct CompressedTempCheckpointLog {
  bytes32 headerHash;
  bytes32 blobCommitmentsHash;
  bytes32 outHash;
  bytes32 attestationsHash;
  bytes32 payloadDigest;
  CompressedSlot slotNumber;
  CompressedFeeHeader feeHeader;
}

library CompressedTempCheckpointLogLib {
  using CompressedTimeMath for Slot;
  using CompressedTimeMath for CompressedSlot;
  using FeeHeaderLib for FeeHeader;
  using FeeHeaderLib for CompressedFeeHeader;

  function compress(TempCheckpointLog memory _checkpoint) internal pure returns (CompressedTempCheckpointLog memory) {
    return CompressedTempCheckpointLog({
      headerHash: _checkpoint.headerHash,
      blobCommitmentsHash: _checkpoint.blobCommitmentsHash,
      outHash: _checkpoint.outHash,
      attestationsHash: _checkpoint.attestationsHash,
      payloadDigest: _checkpoint.payloadDigest,
      slotNumber: _checkpoint.slotNumber.compress(),
      feeHeader: _checkpoint.feeHeader.compress()
    });
  }

  function decompress(CompressedTempCheckpointLog memory _compressedCheckpoint)
    internal
    pure
    returns (TempCheckpointLog memory)
  {
    return TempCheckpointLog({
      headerHash: _compressedCheckpoint.headerHash,
      blobCommitmentsHash: _compressedCheckpoint.blobCommitmentsHash,
      outHash: _compressedCheckpoint.outHash,
      attestationsHash: _compressedCheckpoint.attestationsHash,
      payloadDigest: _compressedCheckpoint.payloadDigest,
      slotNumber: _compressedCheckpoint.slotNumber.decompress(),
      feeHeader: _compressedCheckpoint.feeHeader.decompress()
    });
  }
}
