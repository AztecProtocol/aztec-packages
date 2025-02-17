// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore} from "@aztec/core/interfaces/IRollup.sol";
import {Epoch, Slot, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

library STFLib {
  using TimeLib for Slot;

  bytes32 private constant STF_STORAGE_POSITION = keccak256("aztec.stf.storage");

  function getEpochForBlock(uint256 _blockNumber) internal view returns (Epoch) {
    RollupStore storage rollupStore = STFLib.getStorage();
    require(
      _blockNumber <= rollupStore.tips.pendingBlockNumber,
      Errors.Rollup__InvalidBlockNumber(rollupStore.tips.pendingBlockNumber, _blockNumber)
    );
    return rollupStore.blocks[_blockNumber].slotNumber.epochFromSlot();
  }

  function getStorage() internal pure returns (RollupStore storage storageStruct) {
    bytes32 position = STF_STORAGE_POSITION;
    assembly {
      storageStruct.slot := position
    }
  }
}
