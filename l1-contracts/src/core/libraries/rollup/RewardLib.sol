// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore, EpochRewards} from "@aztec/core/interfaces/IRollup.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {STFLib} from "@aztec/core/libraries/rollup/STFLib.sol";
import {Epoch, Timestamp, Slot, TimeLib} from "@aztec/core/libraries/TimeLib.sol";

library RewardLib {
  using TimeLib for Timestamp;
  using TimeLib for Epoch;

  function claimSequencerRewards(address _recipient) internal returns (uint256) {
    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 amount = rollupStore.sequencerRewards[msg.sender];
    rollupStore.sequencerRewards[msg.sender] = 0;
    rollupStore.config.feeAsset.transfer(_recipient, amount);

    return amount;
  }

  function claimProverRewards(address _recipient, Epoch[] memory _epochs)
    internal
    returns (uint256)
  {
    Slot currentSlot = Timestamp.wrap(block.timestamp).slotFromTimestamp();
    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 proofSubmissionWindow = rollupStore.config.proofSubmissionWindow;

    uint256 accumulatedRewards = 0;
    for (uint256 i = 0; i < _epochs.length; i++) {
      Slot deadline = _epochs[i].toSlots() + Slot.wrap(proofSubmissionWindow);
      require(deadline < currentSlot, Errors.Rollup__NotPastDeadline(deadline, currentSlot));

      // We can use fancier bitmaps for performance
      require(
        !rollupStore.proverClaimed[msg.sender][_epochs[i]],
        Errors.Rollup__AlreadyClaimed(msg.sender, _epochs[i])
      );
      rollupStore.proverClaimed[msg.sender][_epochs[i]] = true;

      EpochRewards storage e = rollupStore.epochRewards[_epochs[i]];
      if (e.subEpoch[e.longestProvenLength].hasSubmitted[msg.sender]) {
        accumulatedRewards += (e.rewards / e.subEpoch[e.longestProvenLength].summedCount);
      }
    }

    rollupStore.config.feeAsset.transfer(_recipient, accumulatedRewards);

    return accumulatedRewards;
  }
}
