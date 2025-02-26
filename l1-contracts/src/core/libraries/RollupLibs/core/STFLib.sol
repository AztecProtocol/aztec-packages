// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore, IRollupCore} from "@aztec/core/interfaces/IRollup.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";

library STFLib {
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using TimeLib for Timestamp;

  bytes32 private constant STF_STORAGE_POSITION = keccak256("aztec.stf.storage");

  function prune() internal {
    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 pending = rollupStore.tips.pendingBlockNumber;

    // @note  We are not deleting the blocks, but we are "winding back" the pendingTip to the last block that was proven.
    //        We can do because any new block proposed will overwrite a previous block in the block log,
    //        so no values should "survive".
    //        People must therefore read the chain using the pendingTip as a boundary.
    rollupStore.tips.pendingBlockNumber = rollupStore.tips.provenBlockNumber;

    emit IRollupCore.PrunedPending(rollupStore.tips.provenBlockNumber, pending);
  }

  function getEpochForBlock(uint256 _blockNumber) internal view returns (Epoch) {
    RollupStore storage rollupStore = STFLib.getStorage();
    require(
      _blockNumber <= rollupStore.tips.pendingBlockNumber,
      Errors.Rollup__InvalidBlockNumber(rollupStore.tips.pendingBlockNumber, _blockNumber)
    );
    return rollupStore.blocks[_blockNumber].slotNumber.epochFromSlot();
  }

  function canPruneAtTime(Timestamp _ts) internal view returns (bool) {
    RollupStore storage rollupStore = STFLib.getStorage();
    if (rollupStore.tips.pendingBlockNumber == rollupStore.tips.provenBlockNumber) {
      return false;
    }

    Epoch oldestPendingEpoch = getEpochForBlock(rollupStore.tips.provenBlockNumber + 1);
    Slot deadline =
      oldestPendingEpoch.toSlots() + Slot.wrap(rollupStore.config.proofSubmissionWindow);

    return deadline < _ts.slotFromTimestamp();
  }

  function getStorage() internal pure returns (RollupStore storage storageStruct) {
    bytes32 position = STF_STORAGE_POSITION;
    assembly {
      storageStruct.slot := position
    }
  }
}
