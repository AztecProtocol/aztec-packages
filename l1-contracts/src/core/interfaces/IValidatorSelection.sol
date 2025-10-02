// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IEmperor} from "@aztec/governance/interfaces/IEmpire.sol";
import {Timestamp, Slot, Epoch} from "@aztec/shared/libraries/TimeMath.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

struct ValidatorSelectionStorage {
  // A mapping to snapshots of the validator set
  mapping(Epoch => bytes32 committeeCommitment) committeeCommitments;
  // Checkpointed map of epoch -> randao value
  Checkpoints.Trace224 randaos;
  uint32 targetCommitteeSize;
  uint32 lagInEpochs;
}

interface IValidatorSelectionCore {
  function setupEpoch() external;
  function checkpointRandao() external;
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

  function getSampleSeedAt(Timestamp _ts) external view returns (uint256);
  function getSamplingSizeAt(Timestamp _ts) external view returns (uint256);
  function getLagInEpochs() external view returns (uint256);
  function getCurrentSampleSeed() external view returns (uint256);

  function getEpochAt(Timestamp _ts) external view returns (Epoch);
  function getSlotAt(Timestamp _ts) external view returns (Slot);
  function getEpochAtSlot(Slot _slotNumber) external view returns (Epoch);

  function getGenesisTime() external view returns (Timestamp);
  function getSlotDuration() external view returns (uint256);
  function getEpochDuration() external view returns (uint256);
  function getTargetCommitteeSize() external view returns (uint256);
}
