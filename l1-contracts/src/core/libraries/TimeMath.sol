// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";

type Timestamp is uint256;

type Slot is uint256;

type Epoch is uint256;

library SlotLib {
  function toTimestamp(Slot _a) internal pure returns (Timestamp) {
    return Timestamp.wrap(Slot.unwrap(_a) * Constants.AZTEC_SLOT_DURATION);
  }

  function fromTimestamp(Timestamp _a) internal pure returns (Slot) {
    return Slot.wrap(Timestamp.unwrap(_a) / Constants.AZTEC_SLOT_DURATION);
  }

  function positionInEpoch(Slot _a) internal pure returns (uint256) {
    return Slot.unwrap(_a) % Constants.AZTEC_EPOCH_DURATION;
  }

  function unwrap(Slot _a) internal pure returns (uint256) {
    return Slot.unwrap(_a);
  }
}

library EpochLib {
  function toSlots(Epoch _a) internal pure returns (Slot) {
    return Slot.wrap(Epoch.unwrap(_a) * Constants.AZTEC_EPOCH_DURATION);
  }

  function toTimestamp(Epoch _a) internal pure returns (Timestamp) {
    return SlotLib.toTimestamp(toSlots(_a));
  }

  function fromTimestamp(Timestamp _a) internal pure returns (Epoch) {
    return Epoch.wrap(
      Timestamp.unwrap(_a) / (Constants.AZTEC_EPOCH_DURATION * Constants.AZTEC_SLOT_DURATION)
    );
  }

  function unwrap(Epoch _a) internal pure returns (uint256) {
    return Epoch.unwrap(_a);
  }
}

using SlotLib for Slot;
using EpochLib for Epoch;

function addTimestamp(Timestamp _a, Timestamp _b) pure returns (Timestamp) {
  return Timestamp.wrap(Timestamp.unwrap(_a) + Timestamp.unwrap(_b));
}

function subTimestamp(Timestamp _a, Timestamp _b) pure returns (Timestamp) {
  return Timestamp.wrap(Timestamp.unwrap(_a) - Timestamp.unwrap(_b));
}

function ltTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) < Timestamp.unwrap(_b);
}

function lteTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) <= Timestamp.unwrap(_b);
}

function gtTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) > Timestamp.unwrap(_b);
}

function gteTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) >= Timestamp.unwrap(_b);
}

function neqTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) != Timestamp.unwrap(_b);
}

function eqTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) == Timestamp.unwrap(_b);
}

// Slot

function addSlot(Slot _a, Slot _b) pure returns (Slot) {
  return Slot.wrap(Slot.unwrap(_a) + Slot.unwrap(_b));
}

function eqSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) == Slot.unwrap(_b);
}

function neqSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) != Slot.unwrap(_b);
}

function ltSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) < Slot.unwrap(_b);
}

function lteSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) <= Slot.unwrap(_b);
}

function gtSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) > Slot.unwrap(_b);
}

function gteSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) >= Slot.unwrap(_b);
}

// Epoch

function eqEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) == Epoch.unwrap(_b);
}

function neqEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) != Epoch.unwrap(_b);
}

function subEpoch(Epoch _a, Epoch _b) pure returns (Epoch) {
  return Epoch.wrap(Epoch.unwrap(_a) - Epoch.unwrap(_b));
}

function addEpoch(Epoch _a, Epoch _b) pure returns (Epoch) {
  return Epoch.wrap(Epoch.unwrap(_a) + Epoch.unwrap(_b));
}

function gteEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) >= Epoch.unwrap(_b);
}

function gtEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) > Epoch.unwrap(_b);
}

function lteEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) <= Epoch.unwrap(_b);
}

function ltEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) < Epoch.unwrap(_b);
}

using {
  addTimestamp as +,
  subTimestamp as -,
  ltTimestamp as <,
  gtTimestamp as >,
  lteTimestamp as <=,
  gteTimestamp as >=,
  neqTimestamp as !=,
  eqTimestamp as ==
} for Timestamp global;

using {
  addEpoch as +,
  subEpoch as -,
  eqEpoch as ==,
  neqEpoch as !=,
  gteEpoch as >=,
  gtEpoch as >,
  lteEpoch as <=,
  ltEpoch as <
} for Epoch global;

using {
  eqSlot as ==,
  neqSlot as !=,
  gteSlot as >=,
  gtSlot as >,
  lteSlot as <=,
  ltSlot as <,
  addSlot as +
} for Slot global;
