// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

type Timestamp is uint256;

type Slot is uint256;

type Epoch is uint256;

abstract contract TimeFns {
  // @note  @LHerskind  The multiple cause pain and suffering in the E2E tests as we introduce
  //                    a timeliness requirement into the publication that did not exists before,
  //                    and at the same time have a setup that will impact the time at every tx
  //                    because of auto-mine. By using just 1, we can make our test work
  //                    but anything using an actual working chain would eat dung as simulating
  //                    transactions is slower than an actual ethereum slot.
  //
  //                    The value should be a higher multiple for any actual chain
  // @todo  #8019
  uint256 public immutable SLOT_DURATION;

  // The duration of an epoch in slots
  // @todo  @LHerskind - This value should be updated when we are not blind.
  // @todo  #8020
  uint256 public immutable EPOCH_DURATION;

  constructor(uint256 _slotDuration, uint256 _epochDuration) {
    SLOT_DURATION = _slotDuration;
    EPOCH_DURATION = _epochDuration;
  }

  function toTimestamp(Slot _a) internal view returns (Timestamp) {
    return Timestamp.wrap(Slot.unwrap(_a) * SLOT_DURATION);
  }

  function slotFromTimestamp(Timestamp _a) internal view returns (Slot) {
    return Slot.wrap(Timestamp.unwrap(_a) / SLOT_DURATION);
  }

  function positionInEpoch(Slot _a) internal view returns (uint256) {
    return Slot.unwrap(_a) % EPOCH_DURATION;
  }

  function toSlots(Epoch _a) internal view returns (Slot) {
    return Slot.wrap(Epoch.unwrap(_a) * EPOCH_DURATION);
  }

  function toTimestamp(Epoch _a) internal view returns (Timestamp) {
    return toTimestamp(toSlots(_a));
  }

  function epochFromTimestamp(Timestamp _a) internal view returns (Epoch) {
    return Epoch.wrap(Timestamp.unwrap(_a) / (EPOCH_DURATION * SLOT_DURATION));
  }
}

library SlotLib {
  function unwrap(Slot _a) internal pure returns (uint256) {
    return Slot.unwrap(_a);
  }
}

library EpochLib {
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

function subSlot(Slot _a, Slot _b) pure returns (Slot) {
  return Slot.wrap(Slot.unwrap(_a) - Slot.unwrap(_b));
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
  addSlot as +,
  subSlot as -
} for Slot global;
