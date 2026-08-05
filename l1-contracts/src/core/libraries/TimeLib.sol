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
   * @notice Number of epochs after the end of a given epoch that proofs are still accepted. For example, a value of 1
   * means that after epoch n ends, the proofs must land *before* epoch n+1 ends. A value of 0 would mean that the
   * proofs for epoch n must land while the epoch is ongoing.
   */
  uint32 proofSubmissionEpochs;
  uint32 ethereumSlotDuration; // Number of seconds in an L1 slot
}

library TimeLib {
  using SafeCast for uint256;

  bytes32 private constant TIME_STORAGE_POSITION = keccak256("aztec.time.storage");

  function initialize(
    uint256 _genesisTime,
    uint256 _slotDuration,
    uint256 _epochDuration,
    uint256 _proofSubmissionEpochs,
    uint256 _ethereumSlotDuration
  ) internal {
    TimeStorage storage store = getStorage();
    store.genesisTime = _genesisTime.toUint128();
    store.slotDuration = _slotDuration.toUint32();
    store.epochDuration = _epochDuration.toUint32();
    store.proofSubmissionEpochs = _proofSubmissionEpochs.toUint32();
    store.ethereumSlotDuration = _ethereumSlotDuration.toUint32();
  }

  function toTimestamp(Slot _a) internal view returns (Timestamp) {
    TimeStorage storage store = getStorage();
    return Timestamp.wrap(store.genesisTime) + Timestamp.wrap(Slot.unwrap(_a) * store.slotDuration);
  }

  /**
   * @notice The timestamp at which the build frame of a checkpoint proposed in `_slot` opens
   *
   * @dev A checkpoint proposed in slot S is built during slot S-1, and the frame opens one L1 slot before that
   *      slot starts, since the builder works from the L1 state as of the preceding L1 block. Anything on L1 by
   *      this timestamp has therefore been visible to every node for the entire build frame.
   *
   * @param _slot - The slot the checkpoint is proposed in
   *
   * @return The timestamp the build frame opens at
   */
  function getBuildFrameStart(Slot _slot) internal view returns (Timestamp) {
    TimeStorage storage store = getStorage();
    return toTimestamp(_slot - Slot.wrap(1)) - Timestamp.wrap(store.ethereumSlotDuration);
  }

  function slotFromTimestamp(Timestamp _a) internal view returns (Slot) {
    TimeStorage storage store = getStorage();
    return Slot.wrap((Timestamp.unwrap(_a) - store.genesisTime) / store.slotDuration);
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
   * @notice Calculates the maximum number of checkpoints that can be pruned from the pending chain
   * @dev The maximum prunable checkpoints is determined by:
   *      - epochDuration: number of slots in an epoch
   *      - proofSubmissionEpochs: number of epochs allowed for proof submission
   *
   *      The formula is: epochDuration * (proofSubmissionEpochs + 1)
   *
   *      The +1 accounts for checkpoints in the current epoch, ensuring they are included
   *      in the prunable window along with checkpoints from previous epochs within the
   *      proof submission window.
   *
   *      This value is used to:
   *      1. Size the circular storage buffer (roundaboutSize = maxPrunableCheckpoints + 1)
   *      2. Determine when checkpoints become stale and can be overwritten
   *
   * @return The maximum number of checkpoints that can be pruned.
   */
  function maxPrunableCheckpoints() internal view returns (uint256) {
    TimeStorage storage store = getStorage();
    return uint256(store.epochDuration) * (uint256(store.proofSubmissionEpochs) + 1);
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

    return Epoch.wrap((Timestamp.unwrap(_a) - store.genesisTime) / (store.epochDuration * store.slotDuration));
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
