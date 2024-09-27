// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.19;

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";

type Timestamp is uint256;

type Slot is uint256;

type Epoch is uint256;

library SlotLib {
  function toTimestamp(Slot a) internal pure returns (Timestamp) {
    return Timestamp.wrap(Slot.unwrap(a) * Constants.AZTEC_SLOT_DURATION);
  }

  function fromTimestamp(Timestamp a) internal pure returns (Slot) {
    return Slot.wrap(Timestamp.unwrap(a) / Constants.AZTEC_SLOT_DURATION);
  }

  function positionInEpoch(Slot a) internal pure returns (uint256) {
    return Slot.unwrap(a) % Constants.AZTEC_EPOCH_DURATION;
  }

  function unwrap(Slot a) internal pure returns (uint256) {
    return Slot.unwrap(a);
  }
}

library EpochLib {
  function toSlots(Epoch a) internal pure returns (Slot) {
    return Slot.wrap(Epoch.unwrap(a) * Constants.AZTEC_EPOCH_DURATION);
  }

  function toTimestamp(Epoch a) internal pure returns (Timestamp) {
    return SlotLib.toTimestamp(toSlots(a));
  }

  function fromTimestamp(Timestamp a) internal pure returns (Epoch) {
    return Epoch.wrap(
      Timestamp.unwrap(a) / (Constants.AZTEC_EPOCH_DURATION * Constants.AZTEC_SLOT_DURATION)
    );
  }

  function unwrap(Epoch a) internal pure returns (uint256) {
    return Epoch.unwrap(a);
  }
}

using SlotLib for Slot;
using EpochLib for Epoch;

function addTimestamp(Timestamp a, Timestamp b) pure returns (Timestamp) {
  return Timestamp.wrap(Timestamp.unwrap(a) + Timestamp.unwrap(b));
}

function subTimestamp(Timestamp a, Timestamp b) pure returns (Timestamp) {
  return Timestamp.wrap(Timestamp.unwrap(a) - Timestamp.unwrap(b));
}

function ltTimestamp(Timestamp a, Timestamp b) pure returns (bool) {
  return Timestamp.unwrap(a) < Timestamp.unwrap(b);
}

function gtTimestamp(Timestamp a, Timestamp b) pure returns (bool) {
  return Timestamp.unwrap(a) > Timestamp.unwrap(b);
}

function neqTimestamp(Timestamp a, Timestamp b) pure returns (bool) {
  return Timestamp.unwrap(a) != Timestamp.unwrap(b);
}

// Slot

function addSlot(Slot a, Slot b) pure returns (Slot) {
  return Slot.wrap(Slot.unwrap(a) + Slot.unwrap(b));
}

function eqSlot(Slot a, Slot b) pure returns (bool) {
  return Slot.unwrap(a) == Slot.unwrap(b);
}

function neqSlot(Slot a, Slot b) pure returns (bool) {
  return Slot.unwrap(a) != Slot.unwrap(b);
}

function ltSlot(Slot a, Slot b) pure returns (bool) {
  return Slot.unwrap(a) < Slot.unwrap(b);
}

function lteSlot(Slot a, Slot b) pure returns (bool) {
  return Slot.unwrap(a) <= Slot.unwrap(b);
}

// Epoch

function eqEpoch(Epoch a, Epoch b) pure returns (bool) {
  return Epoch.unwrap(a) == Epoch.unwrap(b);
}

function neqEpoch(Epoch a, Epoch b) pure returns (bool) {
  return Epoch.unwrap(a) != Epoch.unwrap(b);
}

function subEpoch(Epoch a, Epoch b) pure returns (Epoch) {
  return Epoch.wrap(Epoch.unwrap(a) - Epoch.unwrap(b));
}

function addEpoch(Epoch a, Epoch b) pure returns (Epoch) {
  return Epoch.wrap(Epoch.unwrap(a) + Epoch.unwrap(b));
}

using {
  addTimestamp as +,
  subTimestamp as -,
  ltTimestamp as <,
  gtTimestamp as >,
  neqTimestamp as !=
} for Timestamp global;

using {addEpoch as +, subEpoch as -, eqEpoch as ==, neqEpoch as !=} for Epoch global;

using {eqSlot as ==, neqSlot as !=, lteSlot as <=, ltSlot as <, addSlot as +} for Slot global;
