// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {CheckpointLog} from "@aztec/core/interfaces/IRollup.sol";
import {FeeHeader} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {Epoch, Slot} from "@aztec/shared/libraries/TimeMath.sol";

contract MockRollup {
  mapping(uint256 checkpointNumber => bytes32 archiveRoot) internal archives;
  mapping(uint256 checkpointNumber => bytes32 outHash) internal outHashes;
  mapping(uint256 checkpointNumber => uint256 epoch) internal epochs;
  uint256 internal provenCheckpointNumber;

  function setArchive(uint256 _checkpointNumber, bytes32 _archiveRoot) external {
    archives[_checkpointNumber] = _archiveRoot;
  }

  function setCheckpoint(uint256 _checkpointNumber, bytes32 _archiveRoot, uint256 _epoch, bytes32 _outHash) external {
    archives[_checkpointNumber] = _archiveRoot;
    epochs[_checkpointNumber] = _epoch;
    outHashes[_checkpointNumber] = _outHash;
  }

  function setProvenCheckpointNumber(uint256 _checkpointNumber) external {
    provenCheckpointNumber = _checkpointNumber;
  }

  function getProvenCheckpointNumber() external view returns (uint256) {
    return provenCheckpointNumber;
  }

  function archiveAt(uint256 _checkpointNumber) external view returns (bytes32) {
    return archives[_checkpointNumber];
  }

  function getEpochForCheckpoint(uint256 _checkpointNumber) external view returns (Epoch) {
    return Epoch.wrap(epochs[_checkpointNumber]);
  }

  function getCheckpoint(uint256 _checkpointNumber) external view returns (CheckpointLog memory) {
    return CheckpointLog({
      archive: archives[_checkpointNumber],
      headerHash: bytes32(0),
      blobCommitmentsHash: bytes32(0),
      outHash: outHashes[_checkpointNumber],
      attestationsHash: bytes32(0),
      payloadDigest: bytes32(0),
      slotNumber: Slot.wrap(0),
      feeHeader: FeeHeader({excessMana: 0, manaUsed: 0, ethPerFeeAsset: 0, congestionCost: 0, proverCost: 0})
    });
  }
}
