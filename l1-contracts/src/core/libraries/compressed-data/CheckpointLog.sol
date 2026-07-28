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
  // Streaming Inbox consumption counts (AZIP-22 Fast Inbox). `inboxMsgTotal` is the cumulative Inbox message count
  // consumed as of this checkpoint (the child's parent-total origin); `inboxConsumedBucket` is the bucket sequence
  // number the header's rolling hash corresponds to. Declared next to the slot number so the three share one storage
  // slot (4 + 8 + 8 of 32 bytes): propose writes and reads that slot for the slot-progression check anyway.
  uint64 inboxMsgTotal;
  uint64 inboxConsumedBucket;
  FeeHeader feeHeader;
  // The consensus Inbox rolling hash the checkpoint header committed to, in a slot of its own: epoch proofs anchor
  // both ends of their consumed chain segment against it.
  bytes32 inboxRollingHash;
}

struct CompressedTempCheckpointLog {
  bytes32 headerHash;
  bytes32 blobCommitmentsHash;
  bytes32 outHash;
  bytes32 attestationsHash;
  bytes32 payloadDigest;
  CompressedSlot slotNumber;
  uint64 inboxMsgTotal;
  uint64 inboxConsumedBucket;
  CompressedFeeHeader feeHeader;
  bytes32 inboxRollingHash;
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
      inboxMsgTotal: _checkpoint.inboxMsgTotal,
      inboxConsumedBucket: _checkpoint.inboxConsumedBucket,
      feeHeader: _checkpoint.feeHeader.compress(),
      inboxRollingHash: _checkpoint.inboxRollingHash
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
      inboxMsgTotal: _compressedCheckpoint.inboxMsgTotal,
      inboxConsumedBucket: _compressedCheckpoint.inboxConsumedBucket,
      feeHeader: _compressedCheckpoint.feeHeader.decompress(),
      inboxRollingHash: _compressedCheckpoint.inboxRollingHash
    });
  }
}
