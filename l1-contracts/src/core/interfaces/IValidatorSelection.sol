// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IEscapeHatch} from "@aztec/core/interfaces/IEscapeHatch.sol";
import {IEmperor} from "@aztec/governance/interfaces/IEmpire.sol";
import {Timestamp, Slot, Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

struct ValidatorSelectionStorage {
  // A mapping to snapshots of the validator set
  mapping(Epoch => bytes32 committeeCommitment) committeeCommitments;
  // Checkpointed map of epoch -> randao value
  Checkpoints.Trace224 randaos;
  // The following 3 uint32s pack into a single slot (12 bytes)
  uint32 targetCommitteeSize;
  uint32 lagInEpochsForValidatorSet;
  uint32 lagInEpochsForRandao;
  // Checkpointed escape hatch addresses (key = timestamp, value = address as uint160)
  Checkpoints.Trace160 escapeHatchCheckpoints;
}

interface IValidatorSelectionCore {
  event EscapeHatchUpdated(address escapeHatch);

  function setupEpoch() external;
  function checkpointRandao() external;
  function updateEscapeHatch(address _escapeHatch) external;
}

interface IValidatorSelection is IValidatorSelectionCore, IEmperor {
  function getProposerAt(Timestamp _ts) external returns (address);

  // Non view as uses transient storage
  function getCurrentEpochCommittee() external returns (address[] memory);
  function getCommitteeAt(Timestamp _ts) external returns (address[] memory);
  function getCommitteeCommitmentAt(Timestamp _ts) external returns (bytes32, uint256);
  function getEpochCommittee(Epoch _epoch) external returns (address[] memory);
  function getEpochCommitteeCommitment(Epoch _epoch) external returns (bytes32, uint256);

  // Stable
  function getCurrentEpoch() external view returns (Epoch);

  // Consider removing below this point
  function getTimestampForSlot(Slot _slotNumber) external view returns (Timestamp);
  function getTimestampForEpoch(Epoch _epoch) external view returns (Timestamp);

  function getSampleSeedAt(Timestamp _ts) external view returns (uint256);
  function getSamplingSizeAt(Timestamp _ts) external view returns (uint256);
  function getLagInEpochsForValidatorSet() external view returns (uint256);
  function getLagInEpochsForRandao() external view returns (uint256);
  function getCurrentSampleSeed() external view returns (uint256);

  function getEpochAt(Timestamp _ts) external view returns (Epoch);
  function getSlotAt(Timestamp _ts) external view returns (Slot);
  function getEpochAtSlot(Slot _slotNumber) external view returns (Epoch);

  function getGenesisTime() external view returns (Timestamp);
  function getSlotDuration() external view returns (uint256);
  function getEpochDuration() external view returns (uint256);
  function getTargetCommitteeSize() external view returns (uint256);

  function getEscapeHatch() external view returns (IEscapeHatch);
  function getEscapeHatchForEpoch(Epoch _epoch) external view returns (IEscapeHatch);
}
