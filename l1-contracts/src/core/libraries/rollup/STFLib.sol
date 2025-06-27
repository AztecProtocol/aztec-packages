// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore, IRollupCore, GenesisState} from "@aztec/core/interfaces/IRollup.sol";
import {
  CompressedTempBlockLog,
  TempBlockLog,
  CompressedTempBlockLogLib
} from "@aztec/core/libraries/compressed-data/BlockLog.sol";
import {
  CompressedFeeHeader,
  FeeHeaderLib
} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {ChainTipsLib, CompressedChainTips} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";

library STFLib {
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using TimeLib for Timestamp;
  using CompressedTimeMath for CompressedSlot;
  using ChainTipsLib for CompressedChainTips;
  using CompressedTempBlockLogLib for CompressedTempBlockLog;
  using CompressedTempBlockLogLib for TempBlockLog;
  using CompressedTimeMath for Slot;
  using CompressedTimeMath for CompressedSlot;
  using FeeHeaderLib for CompressedFeeHeader;

  // @note  This is also used in the cheatcodes, so if updating, please also update the cheatcode.
  bytes32 private constant STF_STORAGE_POSITION = keccak256("aztec.stf.storage");

  function initialize(GenesisState memory _genesisState) internal {
    RollupStore storage rollupStore = STFLib.getStorage();

    rollupStore.config.vkTreeRoot = _genesisState.vkTreeRoot;
    rollupStore.config.protocolContractTreeRoot = _genesisState.protocolContractTreeRoot;

    rollupStore.archives[0] = _genesisState.genesisArchiveRoot;
  }

  function setTempBlockLog(uint256 _blockNumber, TempBlockLog memory _tempBlockLog) internal {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    getStorage().tempBlockLogs[_blockNumber % size] = _tempBlockLog.compress();
  }

  function preheatHeaders() internal {
    // Need to ensure that we have not already heated everything!
    uint256 size = roundaboutSize();
    require(!getFeeHeader(size - 1).isPreheated(), Errors.FeeLib__AlreadyPreheated());

    RollupStore storage store = getStorage();

    for (uint256 i = 0; i < size; i++) {
      TempBlockLog memory blockLog = store.tempBlockLogs[i].decompress();

      // DO NOT PREHEAT slot for 0, because there the value 0 is actually meaningful.
      // It is being used in the already in chain checks.
      if (i > 0 && blockLog.slotNumber == Slot.wrap(0)) {
        blockLog.slotNumber = Slot.wrap(1);
      }

      if (blockLog.headerHash == bytes32(0)) {
        blockLog.headerHash = bytes32(uint256(0x1));
      }

      if (blockLog.blobCommitmentsHash == bytes32(0)) {
        blockLog.blobCommitmentsHash = bytes32(uint256(0x1));
      }

      store.tempBlockLogs[i] = blockLog.compress();
    }
  }

  function prune() internal {
    RollupStore storage rollupStore = STFLib.getStorage();
    uint256 pending = rollupStore.tips.getPendingBlockNumber();

    // @note  We are not deleting the blocks, but we are "winding back" the pendingTip to the last block that was proven.
    //        We can do because any new block proposed will overwrite a previous block in the block log,
    //        so no values should "survive".
    //        People must therefore read the chain using the pendingTip as a boundary.
    uint256 proven = rollupStore.tips.getProvenBlockNumber();
    rollupStore.tips = rollupStore.tips.updatePendingBlockNumber(proven);

    emit IRollupCore.PrunedPending(proven, pending);
  }

  function roundaboutSize() internal view returns (uint256) {
    // Must be ensured to contain at least the last provable even after a prune.
    return TimeLib.maxPrunableBlocks() + 1;
  }

  function innerIsStale(uint256 _blockNumber, bool _throw) internal view returns (bool, uint256) {
    uint256 pending = getStorage().tips.getPendingBlockNumber();
    uint256 size = roundaboutSize();

    // @todo @LHerskind look for one-off here!
    bool isStale = _blockNumber + size < pending;

    require(!_throw || !isStale, Errors.Rollup__StaleTempBlockLog(_blockNumber, pending, size));

    return (isStale, size);
  }

  function isTempStale(uint256 _blockNumber) internal view returns (bool) {
    (bool isStale,) = innerIsStale(_blockNumber, false);
    return isStale;
  }

  function getTempBlockLog(uint256 _blockNumber) internal view returns (TempBlockLog memory) {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    return getStorage().tempBlockLogs[_blockNumber % size].decompress();
  }

  function getHeaderHash(uint256 _blockNumber) internal view returns (bytes32) {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    return getStorage().tempBlockLogs[_blockNumber % size].headerHash;
  }

  function getFeeHeader(uint256 _blockNumber) internal view returns (CompressedFeeHeader) {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    return getStorage().tempBlockLogs[_blockNumber % size].feeHeader;
  }

  function getBlobCommitmentsHash(uint256 _blockNumber) internal view returns (bytes32) {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    return getStorage().tempBlockLogs[_blockNumber % size].blobCommitmentsHash;
  }

  function getSlotNumber(uint256 _blockNumber) internal view returns (Slot) {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    return getStorage().tempBlockLogs[_blockNumber % size].slotNumber.decompress();
  }

  function getEffectivePendingBlockNumber(Timestamp _timestamp) internal view returns (uint256) {
    RollupStore storage rollupStore = STFLib.getStorage();
    return STFLib.canPruneAtTime(_timestamp)
      ? rollupStore.tips.getProvenBlockNumber()
      : rollupStore.tips.getPendingBlockNumber();
  }

  function getEpochForBlock(uint256 _blockNumber) internal view returns (Epoch) {
    RollupStore storage rollupStore = STFLib.getStorage();
    require(
      _blockNumber <= rollupStore.tips.getPendingBlockNumber(),
      Errors.Rollup__InvalidBlockNumber(rollupStore.tips.getPendingBlockNumber(), _blockNumber)
    );
    return getSlotNumber(_blockNumber).epochFromSlot();
  }

  function canPruneAtTime(Timestamp _ts) internal view returns (bool) {
    RollupStore storage rollupStore = STFLib.getStorage();
    if (rollupStore.tips.getPendingBlockNumber() == rollupStore.tips.getProvenBlockNumber()) {
      return false;
    }

    Epoch oldestPendingEpoch = getEpochForBlock(rollupStore.tips.getProvenBlockNumber() + 1);
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
