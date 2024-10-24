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

function _addTimestamp(Timestamp _a, Timestamp _b) pure returns (Timestamp) {
  return Timestamp.wrap(Timestamp.unwrap(_a) + Timestamp.unwrap(_b));
}

function _subTimestamp(Timestamp _a, Timestamp _b) pure returns (Timestamp) {
  return Timestamp.wrap(Timestamp.unwrap(_a) - Timestamp.unwrap(_b));
}

function _ltTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) < Timestamp.unwrap(_b);
}

function _lteTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) <= Timestamp.unwrap(_b);
}

function _gtTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) > Timestamp.unwrap(_b);
}

function _gteTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) >= Timestamp.unwrap(_b);
}

function _neqTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) != Timestamp.unwrap(_b);
}

function _eqTimestamp(Timestamp _a, Timestamp _b) pure returns (bool) {
  return Timestamp.unwrap(_a) == Timestamp.unwrap(_b);
}

// Slot

function _addSlot(Slot _a, Slot _b) pure returns (Slot) {
  return Slot.wrap(Slot.unwrap(_a) + Slot.unwrap(_b));
}

function _eqSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) == Slot.unwrap(_b);
}

function _neqSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) != Slot.unwrap(_b);
}

function _ltSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) < Slot.unwrap(_b);
}

function _lteSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) <= Slot.unwrap(_b);
}

function _gtSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) > Slot.unwrap(_b);
}

function _gteSlot(Slot _a, Slot _b) pure returns (bool) {
  return Slot.unwrap(_a) >= Slot.unwrap(_b);
}

// Epoch

function _eqEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) == Epoch.unwrap(_b);
}

function _neqEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) != Epoch.unwrap(_b);
}

function _subEpoch(Epoch _a, Epoch _b) pure returns (Epoch) {
  return Epoch.wrap(Epoch.unwrap(_a) - Epoch.unwrap(_b));
}

function _addEpoch(Epoch _a, Epoch _b) pure returns (Epoch) {
  return Epoch.wrap(Epoch.unwrap(_a) + Epoch.unwrap(_b));
}

function _gteEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) >= Epoch.unwrap(_b);
}

function _gtEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) > Epoch.unwrap(_b);
}

function _lteEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) <= Epoch.unwrap(_b);
}

function _ltEpoch(Epoch _a, Epoch _b) pure returns (bool) {
  return Epoch.unwrap(_a) < Epoch.unwrap(_b);
}

using {
  _addTimestamp as +,
  _subTimestamp as -,
  _ltTimestamp as <,
  _gtTimestamp as >,
  _lteTimestamp as <=,
  _gteTimestamp as >=,
  _neqTimestamp as !=,
  _eqTimestamp as ==
} for Timestamp global;

using {
  _addEpoch as +,
  _subEpoch as -,
  _eqEpoch as ==,
  _neqEpoch as !=,
  _gteEpoch as >=,
  _gtEpoch as >,
  _lteEpoch as <=,
  _ltEpoch as <
} for Epoch global;

using {
  _eqSlot as ==,
  _neqSlot as !=,
  _gteSlot as >=,
  _gtSlot as >,
  _lteSlot as <=,
  _ltSlot as <,
  _addSlot as +
} for Slot global;
