// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {TestConstants} from "@test/harnesses/TestConstants.sol";

/// @notice Fake Rollup for EscapeHatch testing
/// @dev Implements the subset of IRollup and IValidatorSelection needed by EscapeHatch
///      Allows setting arbitrary values for provenCheckpointNumber and archiveAt
contract FakeRollup {
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using TimeLib for Timestamp;

  // Controllable state
  uint256 public provenCheckpointNumber;
  mapping(uint256 => bytes32) public archives;

  constructor() {
    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );
  }

  // ============ Setters for test control ============

  function setProvenCheckpointNumber(uint256 _checkpointNumber) external {
    provenCheckpointNumber = _checkpointNumber;
  }

  function setArchiveAt(uint256 _checkpointNumber, bytes32 _archive) external {
    archives[_checkpointNumber] = _archive;
  }

  // ============ IRollup methods used by EscapeHatch ============

  function getProvenCheckpointNumber() external view returns (uint256) {
    return provenCheckpointNumber;
  }

  function archiveAt(uint256 _checkpointNumber) external view returns (bytes32) {
    return archives[_checkpointNumber];
  }

  function getProofSubmissionEpochs() external view returns (uint256) {
    return TimeLib.getStorage().proofSubmissionEpochs;
  }

  // ============ IValidatorSelection methods used by EscapeHatch ============

  function getCurrentEpoch() external view returns (Epoch) {
    return Timestamp.wrap(block.timestamp).epochFromTimestamp();
  }

  function getTimestampForEpoch(Epoch _epoch) external view returns (Timestamp) {
    return _epoch.toTimestamp();
  }

  function getSampleSeedAt(Timestamp _ts) external pure returns (uint256) {
    // Return deterministic seed based on timestamp for reproducible tests
    return uint256(keccak256(abi.encodePacked("seed", _ts)));
  }
}
