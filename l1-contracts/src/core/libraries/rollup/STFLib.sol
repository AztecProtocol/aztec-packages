// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore, IRollupCore, GenesisState} from "@aztec/core/interfaces/IRollup.sol";
import {BlockLogLib, BlockLog} from "@aztec/core/libraries/compressed-data/BlockLog.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";

library STFLib {
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using TimeLib for Timestamp;
  using BlockLogLib for BlockLog;
  using CompressedTimeMath for CompressedSlot;

  // @note  This is also used in the cheatcodes, so if updating, please also update the cheatcode.
  bytes32 private constant STF_STORAGE_POSITION = keccak256("aztec.stf.storage");

  function initialize(GenesisState memory _genesisState) internal {
    RollupStore storage rollupStore = STFLib.getStorage();

    rollupStore.config.vkTreeRoot = _genesisState.vkTreeRoot;
    rollupStore.config.protocolContractTreeRoot = _genesisState.protocolContractTreeRoot;

    rollupStore.blocks[0] = BlockLog({
      archive: _genesisState.genesisArchiveRoot,
      headerHash: 0,
      blobCommitmentsHash: 0,
      slotNumber: Slot.wrap(0)
    }).compress();
  }

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

  function getEffectivePendingBlockNumber(Timestamp _timestamp) internal view returns (uint256) {
    RollupStore storage rollupStore = STFLib.getStorage();
    return STFLib.canPruneAtTime(_timestamp)
      ? rollupStore.tips.provenBlockNumber
      : rollupStore.tips.pendingBlockNumber;
  }

  function getEpochForBlock(uint256 _blockNumber) internal view returns (Epoch) {
    RollupStore storage rollupStore = STFLib.getStorage();
    require(
      _blockNumber <= rollupStore.tips.pendingBlockNumber,
      Errors.Rollup__InvalidBlockNumber(rollupStore.tips.pendingBlockNumber, _blockNumber)
    );
    return rollupStore.blocks[_blockNumber].slotNumber.decompress().epochFromSlot();
  }

  function canPruneAtTime(Timestamp _ts) internal view returns (bool) {
    RollupStore storage rollupStore = STFLib.getStorage();
    if (rollupStore.tips.pendingBlockNumber == rollupStore.tips.provenBlockNumber) {
      return false;
    }

    Epoch oldestPendingEpoch = getEpochForBlock(rollupStore.tips.provenBlockNumber + 1);
    Epoch currentEpoch = _ts.epochFromTimestamp();

    return !oldestPendingEpoch.isAcceptingProofsAtEpoch(currentEpoch);
  }

  function getStorage() internal pure returns (RollupStore storage storageStruct) {
    bytes32 position = STF_STORAGE_POSITION;
    assembly {
      storageStruct.slot := position
    }
  }
}
