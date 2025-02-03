// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable-next-line no-unused-import
import {Timestamp, Slot, Epoch, SlotLib, EpochLib} from "@aztec/core/libraries/TimeMath.sol";

struct TimeStorage {
  uint256 genesisTime;
  uint256 slotDuration; // Number of seconds in a slot
  uint256 epochDuration; // Number of slots in an epoch
}

library TimeLib {
  bytes32 private constant TIME_STORAGE_POSITION = keccak256("aztec.time.storage");

  function initialize(uint256 _genesisTime, uint256 _slotDuration, uint256 _epochDuration) internal {
    TimeStorage storage store = getStorage();
    store.genesisTime = _genesisTime;
    store.slotDuration = _slotDuration;
    store.epochDuration = _epochDuration;
  }

  function toTimestamp(Slot _a) internal view returns (Timestamp) {
    TimeStorage storage store = getStorage();
    return Timestamp.wrap(store.genesisTime) + Timestamp.wrap(Slot.unwrap(_a) * store.slotDuration);
  }

  function slotFromTimestamp(Timestamp _a) internal view returns (Slot) {
    TimeStorage storage store = getStorage();
    return Slot.wrap((Timestamp.unwrap(_a) - store.genesisTime) / store.slotDuration);
  }

  function positionInEpoch(Slot _a) internal view returns (uint256) {
    return Slot.unwrap(_a) % getStorage().epochDuration;
  }

  function toSlots(Epoch _a) internal view returns (Slot) {
    return Slot.wrap(Epoch.unwrap(_a) * getStorage().epochDuration);
  }

  function toTimestamp(Epoch _a) internal view returns (Timestamp) {
    return toTimestamp(toSlots(_a));
  }

  function epochFromTimestamp(Timestamp _a) internal view returns (Epoch) {
    TimeStorage storage store = getStorage();
    return Epoch.wrap(
      (Timestamp.unwrap(_a) - store.genesisTime) / (store.epochDuration * store.slotDuration)
    );
  }

  function epochFromSlot(Slot _a) internal view returns (Epoch) {
    return Epoch.wrap(Slot.unwrap(_a) / getStorage().epochDuration);
  }

  function getStorage() internal pure returns (TimeStorage storage storageStruct) {
    bytes32 position = TIME_STORAGE_POSITION;
    assembly {
      storageStruct.slot := position
    }
  }
}
