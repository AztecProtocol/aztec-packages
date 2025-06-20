// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

// solhint-disable-next-line no-unused-import
import {Timestamp, Slot, Epoch} from "@aztec/shared/libraries/TimeMath.sol";

import {SafeCast} from "@oz/utils/math/SafeCast.sol";

struct TimeStorage {
  uint128 genesisTime;
  uint32 slotDuration; // Number of seconds in a slot
  uint32 epochDuration; // Number of slots in an epoch
  /**
   * @notice Number of epochs after the end of a given epoch that proofs are still accepted. For example, a value of 1 means that after epoch n ends, the proofs must land *before* epoch n+1 ends. A value of 0 would mean that the proofs for epoch n must land while the epoch is ongoing.
   */
  uint32 proofSubmissionEpochs;
}

library TimeLib {
  using SafeCast for uint256;

  bytes32 private constant TIME_STORAGE_POSITION = keccak256("aztec.time.storage");

  function initialize(
    uint256 _genesisTime,
    uint256 _slotDuration,
    uint256 _epochDuration,
    uint256 _proofSubmissionEpochs
  ) internal {
    TimeStorage storage store = getStorage();
    store.genesisTime = _genesisTime.toUint128();
    store.slotDuration = _slotDuration.toUint32();
    store.epochDuration = _epochDuration.toUint32();
    store.proofSubmissionEpochs = _proofSubmissionEpochs.toUint32();
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

  /**
   * @notice An epoch deadline is the epoch at which:
   *         - proofs are no longer accepted
   *         - which we may prune if no proof has landed
   *         - rewards may be claimed
   *
   * @param _a - The epoch to compute the deadline for
   *
   * @return The computed epoch
   */
  function toDeadlineEpoch(Epoch _a) internal view returns (Epoch) {
    TimeStorage storage store = getStorage();
    // We add one to the proof submission epochs to account for the current epoch.
    // This is because toSlots will return the first slot of the epoch, and in the event
    // that proofSubmissionEpochs is 0, we would wait until the end of the current epoch.
    return _a + Epoch.wrap(store.proofSubmissionEpochs + 1);
  }

  /**
   * @notice Checks if proofs are being accepted for epoch _a during epoch _b
   *
   * @param _a - The epoch that may be accepting proofs
   * @param _b - The epoch we would like to submit the proof for
   *
   * @return True if proofs would be accepted for epoch _a during epoch _b
   */
  function isAcceptingProofsAtEpoch(Epoch _a, Epoch _b) internal view returns (bool) {
    return _b < toDeadlineEpoch(_a);
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

  function getEpochDurationInSeconds() internal view returns (uint256) {
    TimeStorage storage store = getStorage();
    return store.epochDuration * store.slotDuration;
  }

  function getStorage() internal pure returns (TimeStorage storage storageStruct) {
    bytes32 position = TIME_STORAGE_POSITION;
    assembly {
      storageStruct.slot := position
    }
  }
}
