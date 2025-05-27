// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp, Slot, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";
/**
 * @notice  The data structure for an epoch
 * @param committee - The attesters for the epoch
 * @param sampleSeed - The seed used to sample the attesters of the epoch
 * @param nextSeed - The seed used to influence the NEXT epoch
 */

struct EpochData {
  // TODO: remove in favor of commitment to comittee
  address[] committee;
}

struct ValidatorSelectionStorage {
  // A mapping to snapshots of the validator set
  mapping(Epoch => EpochData) epochs;
  // Checkpointed map of epoch -> sample seed
  Checkpoints.Trace224 seeds;
  uint256 targetCommitteeSize;
}

interface IValidatorSelectionCore {
  function setupEpoch() external;
  function setupSeedSnapshotForNextEpoch() external;
}

interface IValidatorSelection is IValidatorSelectionCore {
  // Likely changing to optimize in Pleistarchus
  function getCurrentProposer() external returns (address);
  function getProposerAt(Timestamp _ts) external returns (address);

  // Non view as uses transient storage
  function getCurrentEpochCommittee() external returns (address[] memory);
  function getCommitteeAt(Timestamp _ts) external returns (address[] memory);
  function getEpochCommittee(Epoch _epoch) external returns (address[] memory);

  // Stable
  function getCurrentEpoch() external view returns (Epoch);
  function getCurrentSlot() external view returns (Slot);

  // Consider removing below this point
  function getTimestampForSlot(Slot _slotNumber) external view returns (Timestamp);

  // Likely removal of these to replace with a size and indiviual getter
  // Get the current epoch committee
  function getAttesters() external view returns (address[] memory);

  function getSampleSeedAt(Timestamp _ts) external view returns (uint256);
  function getCurrentSampleSeed() external view returns (uint256);

  function getEpochAt(Timestamp _ts) external view returns (Epoch);
  function getSlotAt(Timestamp _ts) external view returns (Slot);
  function getEpochAtSlot(Slot _slotNumber) external view returns (Epoch);

  function getGenesisTime() external view returns (Timestamp);
  function getSlotDuration() external view returns (uint256);
  function getEpochDuration() external view returns (uint256);
  function getTargetCommitteeSize() external view returns (uint256);
}
