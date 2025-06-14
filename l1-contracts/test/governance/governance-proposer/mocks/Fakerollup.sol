// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {TestConstants} from "../../../harnesses/TestConstants.sol";

contract Fakerollup {
  using TimeLib for Slot;
  using TimeLib for Timestamp;

  constructor() {
    TimeLib.initialize(
      block.timestamp, TestConstants.AZTEC_SLOT_DURATION, TestConstants.AZTEC_EPOCH_DURATION
    );
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

  function getCurrentProposer() external pure returns (address) {
    return address(0);
  }

  function getVersion() external view returns (uint256) {
    return uint256(keccak256(abi.encodePacked(bytes("aztec_rollup"), block.chainid, address(this))));
  }
}
