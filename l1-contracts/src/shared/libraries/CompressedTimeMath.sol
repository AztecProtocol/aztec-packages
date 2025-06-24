// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp, Slot, Epoch} from "./TimeMath.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

type CompressedTimestamp is uint32;

type CompressedSlot is uint32;

type CompressedEpoch is uint32;

library CompressedTimeMath {
  function compress(Timestamp _timestamp) internal pure returns (CompressedTimestamp) {
    return CompressedTimestamp.wrap(SafeCast.toUint32(Timestamp.unwrap(_timestamp)));
  }

  function compress(Slot _slot) internal pure returns (CompressedSlot) {
    return CompressedSlot.wrap(SafeCast.toUint32(Slot.unwrap(_slot)));
  }

  function compress(Epoch _epoch) internal pure returns (CompressedEpoch) {
    return CompressedEpoch.wrap(SafeCast.toUint32(Epoch.unwrap(_epoch)));
  }

  function decompress(CompressedTimestamp _ts) internal pure returns (Timestamp) {
    return Timestamp.wrap(uint256(CompressedTimestamp.unwrap(_ts)));
  }

  function decompress(CompressedSlot _slot) internal pure returns (Slot) {
    return Slot.wrap(uint256(CompressedSlot.unwrap(_slot)));
  }

  function decompress(CompressedEpoch _epoch) internal pure returns (Epoch) {
    return Epoch.wrap(uint256(CompressedEpoch.unwrap(_epoch)));
  }
}
