// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {TestConstants} from "../../../harnesses/TestConstants.sol";

contract Fakerollup {
  using TimeLib for Slot;
  using TimeLib for Timestamp;

  address internal proposer;

  constructor() {
    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );
  }

  function setProposer(address _proposer) external {
    proposer = _proposer;
  }

  function getTimestampForSlot(Slot _slot) external view returns (Timestamp) {
    return _slot.toTimestamp();
  }

  function getCurrentSlot() external view returns (Slot) {
    return Timestamp.wrap(block.timestamp).slotFromTimestamp();
  }

  function getGenesisTime() external view returns (Timestamp) {
    return Timestamp.wrap(TimeLib.getStorage().genesisTime);
  }

  function getSlotDuration() external view returns (uint256) {
    return TimeLib.getStorage().slotDuration;
  }

  function getEpochDuration() external view returns (uint256) {
    return TimeLib.getStorage().epochDuration;
  }

  function getProofSubmissionEpochs() external view returns (uint256) {
    return TimeLib.getStorage().proofSubmissionEpochs;
  }

  function getCurrentProposer() external view returns (address) {
    return proposer;
  }

  function getVersion() external view returns (uint256) {
    return uint256(keccak256(abi.encodePacked(bytes("aztec_rollup"), block.chainid, address(this))));
  }
}
