// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp, Slot, Epoch} from "@aztec/core/libraries/TimeMath.sol";

/**
 * @notice  The data structure for an epoch
 * @param committee - The attesters for the epoch
 * @param sampleSeed - The seed used to sample the attesters of the epoch
 * @param nextSeed - The seed used to influence the NEXT epoch
 */
struct EpochData {
  address[] committee;
  uint256 sampleSeed;
  uint256 nextSeed;
}

struct LeonidasStorage {
  // A mapping to snapshots of the validator set
  mapping(Epoch => EpochData) epochs;
  // The last stored randao value, same value as `seed` in the last inserted epoch
  uint256 lastSeed;
}

interface ILeonidas {
  // Likely changing to optimize in Pleistarchus
  function setupEpoch() external;
  function getCurrentProposer() external view returns (address);
  function getProposerAt(Timestamp _ts) external view returns (address);

  // Stable
  function getCurrentEpoch() external view returns (Epoch);
  function getCurrentSlot() external view returns (Slot);

  // Consider removing below this point
  function getTimestampForSlot(Slot _slotNumber) external view returns (Timestamp);

  // Likely removal of these to replace with a size and indiviual getter
  // Get the current epoch committee
  function getCurrentEpochCommittee() external view returns (address[] memory);
  function getCommitteeAt(Timestamp _ts) external view returns (address[] memory);
  function getEpochCommittee(Epoch _epoch) external view returns (address[] memory);
  function getAttesters() external view returns (address[] memory);

  function getSampleSeedAt(Timestamp _ts) external view returns (uint256);
  function getCurrentSampleSeed() external view returns (uint256);

  function getEpochAt(Timestamp _ts) external view returns (Epoch);
  function getSlotAt(Timestamp _ts) external view returns (Slot);
  function getEpochAtSlot(Slot _slotNumber) external view returns (Epoch);
}
