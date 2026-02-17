// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Hatch} from "@aztec/core/libraries/HatchMath.sol";
import {Epoch} from "@aztec/shared/libraries/TimeMath.sol";

/**
 * @title Status
 *
 * @notice The status of an escape hatch candidate
 *
 * @param NONE - The candidate has never joined or has fully exited
 * @param ACTIVE - The candidate is in the active set and may be selected
 * @param PROPOSING - The candidate has been selected as designated proposer for a hatch
 * @param EXITING - The candidate is exiting and waiting for the exit delay to pass
 */
enum Status {
  NONE,
  ACTIVE,
  PROPOSING,
  EXITING
}

/**
 * @title CandidateInfo
 *
 * @notice Information about an escape hatch candidate
 */
struct CandidateInfo {
  Status status;
  uint96 amount;
  uint32 exitableAt;
  uint32 lastCheckpointNumber;
  bytes32 lastSubmittedArchive;
}

interface IEscapeHatchCore {
  event CandidateJoined(address indexed candidate);
  event CandidateExitInitiated(address indexed candidate, uint256 exitableAt);
  event CandidateExited(address indexed candidate, uint256 amountReturned);
  event CandidateSelected(Hatch indexed hatch, address indexed candidate);
  event ArchiveUpdated(address indexed proposer, uint128 checkpointNumber, bytes32 archive);
  event ProofValidated(Hatch indexed hatch, address indexed proposer, bool success, uint256 punishment);

  function joinCandidateSet() external;
  function initiateExit() external;
  function leaveCandidateSet() external;
  function selectCandidates() external;
  function updateSubmittedArchive(address _proposer, uint128 _checkpointNumber, bytes32 _archive) external;
  function validateProofSubmission(Hatch _hatch) external;
}

interface IEscapeHatch is IEscapeHatchCore {
  function isHatchOpen(Epoch _epoch) external view returns (bool isOpen, address proposer);
  function getCurrentHatch() external view returns (Hatch);
  function getHatch(Epoch _epoch) external view returns (Hatch);
  function getFirstEpoch(Hatch _hatch) external view returns (Epoch);
  function getDesignatedProposer(Hatch _hatch) external view returns (address);
  function isHatchPrepared(Hatch _hatch) external view returns (bool);
  function isHatchValidated(Hatch _hatch) external view returns (bool);
  function getCandidateInfo(address _candidate) external view returns (CandidateInfo memory);
  function getCandidateCount() external view returns (uint256);
  function getCandidateCountForHatch(Hatch _hatch) external view returns (uint256);
  function getCandidateAtIndex(uint256 _index) external view returns (address);
  function getCandidateAtIndexForHatch(uint256 _index, Hatch _hatch) external view returns (address);
  function isCandidate(address _candidate) external view returns (bool);
  function getSetTimestamp(Hatch _hatch) external view returns (uint32);
  function getSeedTimestamp(Hatch _hatch) external view returns (uint32);
  function getRollup() external view returns (address);
  function getBondToken() external view returns (address);
  function getBondSize() external view returns (uint96);
  function getWithdrawalTax() external view returns (uint96);
  function getFailedHatchPunishment() external view returns (uint96);
  function getFrequency() external view returns (uint256);
  function getActiveDuration() external view returns (uint256);
  function getLagInHatches() external view returns (uint256);
  function getProposingExitDelay() external view returns (uint256);
}
