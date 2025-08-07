// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore, IRollupCore, GenesisState} from "@aztec/core/interfaces/IRollup.sol";
import {
  CompressedTempBlockLog,
  TempBlockLog,
  CompressedTempBlockLogLib
} from "@aztec/core/libraries/compressed-data/BlockLog.sol";
import {CompressedFeeHeader, FeeHeaderLib} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {ChainTipsLib, CompressedChainTips} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";

/**
 * @title STFLib - State Transition Function Library
 * @author Aztec Labs
 * @notice Core library responsible for managing the rollup state transition function and block storage.
 *
 * @dev This library implements the essential state management functionality for the Aztec rollup, including:
 *      - Archive root storage indexed by block number for permanent state history
 *      - Circular storage for temporary block logs
 *      - Block pruning mechanism to remove unproven blocks after proof submission window expires
 *      - Namespaced storage pattern following EIP-7201 for secure storage isolation
 *
 *      Storage Architecture:
 *      - Uses EIP-7201 namespaced storage
 *      - Archives mapping: permanent storage of proven block archive roots
 *      - TempBlockLogs: circular buffer storing temporary block data (gets overwritten after N blocks)
 *      - Tips: tracks both pending (latest proposed) and proven (latest with valid proof) block numbers
 *
 *      Circular Storage ("Roundabout") Pattern:
 *      - The temporary block logs use a circular storage pattern where blocks are stored at index (blockNumber %
 *        roundaboutSize).
 *        This reuses storage slots for old blocks that have been proven or pruned.
 *        The roundabout size is calculated as maxPrunableBlocks() + 1 to ensure at least the last provable block
 *        remains accessible even after pruning operations. This saves gas costs by minimizing storage writes to fresh
 *        slots.
 *
 *      Pruning Mechanism:
 *      - Blocks become eligible for pruning when their proof submission window expires. The proof submission
 *        window is defined as a configurable number of epochs after the epoch containing the block.
 *        When pruning occurs, all unproven blocks are removed from the pending chain, and the chain
 *        resumes from the last proven block.
 *      - Rationale for pruning is that an epoch may contain a block that provers cannot prove. Pruning allows us to
 *        trade a large reorg for chain liveness, by removing potential unprovable blocks so we can continue.
 *      - A prover may not be able to prove a block if the transaction data for that block is not available. Transaction
 *        data is NOT posted to DA since transactions (along with their ClientIVC proofs) are big, and it would be too
 *        costly to submit everything to blocks. So we count on the committee to attest to the availability of that
 *        data, but if for some reason the data does not reach provers via p2p, then provers will not be able to prove.
 *
 *      Security Considerations:
 *      - Archive roots provide immutable history of proven state transitions
 *      - Circular storage saves gas while maintaining necessary data
 *      - Proof submission windows ensure liveness by preventing indefinite stalling
 *      - EIP-7201 namespaced storage prevents accidental storage collisions with other contracts
 *
 * @dev TempBlockLog Structure
 *
 *      The TempBlockLog struct represents temporary block data stored in the circular buffer
 *      until blocks overwritten. It contains:
 *
 *      Fields:
 *      - headerHash: Hash of the complete block header containing all block metadata
 *      - blobCommitmentsHash: Hash of all blob commitments used for data availability verification
 *      - attestationsHash: Hash of committee member attestations validating the block
 *      - payloadDigest: Digest of the proposal payload that committee members attested to
 *      - slotNumber: The specific slot when this block was proposed (determines epoch assignment)
 *      - feeHeader: Compressed fee information including base fees and mana pricing
 *
 *      Storage Optimization:
 *      The struct is stored in compressed format (CompressedTempBlockLog) to minimize gas costs.
 *      Compression primarily affects the slotNumber (reduced from 256-bit to smaller representation)
 *      and feeHeader (packed fee components). Other fields remain as 32-byte hashes.
 */
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

  /**
   * @notice Initializes the rollup state with genesis configuration
   * @dev Sets up the initial state of the rollup including verification keys and the genesis archive root.
   *      This function should only be called once during rollup deployment.
   *
   * @param _genesisState The initial state configuration containing:
   *        - vkTreeRoot: Root of the verification key tree for circuit verification
   *        - protocolContractTreeRoot: Root containing protocol contract addresses and configurations
   *        - genesisArchiveRoot: Initial archive root representing the genesis state
   */
  function initialize(GenesisState memory _genesisState) internal {
    RollupStore storage rollupStore = STFLib.getStorage();

    rollupStore.config.vkTreeRoot = _genesisState.vkTreeRoot;
    rollupStore.config.protocolContractTreeRoot = _genesisState.protocolContractTreeRoot;

    rollupStore.archives[0] = _genesisState.genesisArchiveRoot;
  }

  /**
   * @notice Stores a temporary block log in the circular storage buffer
   * @dev Compresses and stores block data at the appropriate index in the circular buffer.
   *      The storage index is calculated as (_blockNumber % roundaboutSize) to implement
   *      the circular storage pattern. Reverts if the block number is stale.
   *
   * @param _blockNumber The L2 block number to store the log for
   * @param _tempBlockLog The temporary block log containing header hash, attestations,
   *        blob commitments, payload digest, slot number, and fee information
   */
  function setTempBlockLog(uint256 _blockNumber, TempBlockLog memory _tempBlockLog) internal {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    getStorage().tempBlockLogs[_blockNumber % size] = _tempBlockLog.compress();
  }

  /**
   * @notice Preheats the temporary block log storage with non-zero values to optimize gas costs for accurate
   * benchmarking
   * @dev Iterates through all slots in the circular storage and replaces zero values with 0x1
   *      to avoid expensive SSTORE operations when transitioning from zero to non-zero values.
   *      This is a gas optimization technique used primarily for benchmarking and testing.
   *
   *      Special handling for slot 0: The slot number remains 0 for the first slot as it's
   *      used in "already in chain" checks where 0 has semantic meaning.
   *
   *      Reverts if storage has already been preheated to prevent double-initialization.
   */
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

      if (blockLog.attestationsHash == bytes32(0)) {
        blockLog.attestationsHash = bytes32(uint256(0x1));
      }

      if (blockLog.payloadDigest == bytes32(0)) {
        blockLog.payloadDigest = bytes32(uint256(0x1));
      }

      store.tempBlockLogs[i] = blockLog.compress();
    }
  }

  /**
   * @notice Removes unproven blocks from the pending chain when proof submission window expires
   * @dev This function implements the pruning mechanism that maintains rollup liveness by removing
   *      blocks that cannot be proven within the configured time window. When called:
   *
   *      1. Identifies the gap between pending and proven block numbers
   *      2. Resets the pending chain tip to match the last proven block
   *      3. Effectively removes all unproven blocks from the pending chain
   *
   *      The pruning does not delete block data from storage but makes it inaccessible by
   *      updating the chain tips.
   *
   *      Pruning should only occur when the proof submission window has expired for pending
   *      blocks, which is validated by the calling function (typically through canPruneAtTime).
   *
   *      Emits PrunedPending event with the proven and previously pending block numbers.
   */
  function prune() internal {
    RollupStore storage rollupStore = STFLib.getStorage();
    CompressedChainTips tips = rollupStore.tips;
    uint256 pending = tips.getPendingBlockNumber();

    // @note  We are not deleting the blocks, but we are "winding back" the pendingTip to the last block that was
    // proven.
    //        We can do because any new block proposed will overwrite a previous block in the block log,
    //        so no values should "survive".
    //        People must therefore read the chain using the pendingTip as a boundary.
    uint256 proven = tips.getProvenBlockNumber();
    rollupStore.tips = tips.updatePendingBlockNumber(proven);

    emit IRollupCore.PrunedPending(proven, pending);
  }

  /**
   * @notice Calculates the size of the circular storage buffer for temporary block logs
   * @dev The roundabout size determines how many blocks can be stored in the circular buffer
   *      before older entries are overwritten. The size is calculated as:
   *
   *      roundaboutSize = maxPrunableBlocks() + 1
   *
   *      Where maxPrunableBlocks() = epochDuration * (proofSubmissionEpochs + 1)
   *
   *      This ensures that:
   *      - All blocks within the proof submission window remain accessible
   *      - At least one additional slot is available for the next block
   *
   * @return The number of slots in the circular storage buffer
   */
  function roundaboutSize() internal view returns (uint256) {
    // Must be ensured to contain at least the last provable even after a prune.
    return TimeLib.maxPrunableBlocks() + 1;
  }

  /**
   * @notice Determines if a block number is stale (no longer accessible in circular storage)
   * @dev A block is considered stale if it can no longer be accessed in the circular storage buffer.
   *      The staleness is determined by the relationship between the block number, current pending
   *      block, and the buffer size.
   *
   *      Example with roundabout size 5 and pending block 7:
   *      Circular buffer state: [block3, block4, block5, block6, block7]
   *      Buffer indices:        [3,     4,     0,     1,     2    ]
   *
   *      Block 2 and below are stale because:
   *      - blockNumber + size <= pending
   *      - 2 + 5 <= 7 ✓ (stale)
   *      - 3 + 5 <= 7 ✗ (not stale)
   *
   *      This ensures that only blocks within the current "window" of the circular buffer
   *      are considered valid and accessible.
   *
   * @param _blockNumber The block number to check for staleness
   * @param _throw Whether to revert if the block is stale (true) or just return the result (false)
   * @return isStale True if the block is stale and no longer accessible
   * @return size The current size of the circular storage buffer
   */
  function innerIsStale(uint256 _blockNumber, bool _throw) internal view returns (bool, uint256) {
    uint256 pending = getStorage().tips.getPendingBlockNumber();
    uint256 size = roundaboutSize();

    bool isStale = _blockNumber + size <= pending;

    require(!_throw || !isStale, Errors.Rollup__StaleTempBlockLog(_blockNumber, pending, size));

    return (isStale, size);
  }

  /**
   * @notice Checks if a block number is stale without reverting
   * @dev Convenience function that wraps innerIsStale with _throw=false
   * @param _blockNumber The block number to check for staleness
   * @return True if the block is stale and no longer accessible
   */
  function isTempStale(uint256 _blockNumber) internal view returns (bool) {
    (bool isStale,) = innerIsStale(_blockNumber, false);
    return isStale;
  }

  /**
   * @notice Retrieves and decompresses a temporary block log from circular storage
   * @dev Fetches the compressed block log from the circular buffer and decompresses it.
   *      Reverts if the block number is stale and no longer accessible.
   * @param _blockNumber The block number to retrieve the log for
   * @return The decompressed temporary block log containing all block metadata
   */
  function getTempBlockLog(uint256 _blockNumber) internal view returns (TempBlockLog memory) {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    return getStorage().tempBlockLogs[_blockNumber % size].decompress();
  }

  /**
   * @notice Returns a storage reference to a compressed temporary block log
   * @dev Provides direct access to the compressed block log in storage without decompression.
   *      Reverts if the block number is stale.
   * @param _blockNumber The block number to get the storage reference for
   * @return A storage reference to the compressed temporary block log
   */
  function getStorageTempBlockLog(uint256 _blockNumber) internal view returns (CompressedTempBlockLog storage) {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    return getStorage().tempBlockLogs[_blockNumber % size];
  }

  /**
   * @notice Retrieves the header hash for a specific block number
   * @dev Gas-efficient accessor that returns only the header hash without decompressing
   *      the entire block log. Reverts if the block number is stale.
   * @param _blockNumber The block number to get the header hash for
   * @return The header hash of the specified block
   */
  function getHeaderHash(uint256 _blockNumber) internal view returns (bytes32) {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    return getStorage().tempBlockLogs[_blockNumber % size].headerHash;
  }

  /**
   * @notice Retrieves the compressed fee header for a specific block number
   * @dev Returns the fee information including base fee components and mana costs.
   *      The data remains in compressed format for gas efficiency. Reverts if the block is stale.
   * @param _blockNumber The block number to get the fee header for
   * @return The compressed fee header containing fee-related data
   */
  function getFeeHeader(uint256 _blockNumber) internal view returns (CompressedFeeHeader) {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    return getStorage().tempBlockLogs[_blockNumber % size].feeHeader;
  }

  /**
   * @notice Retrieves the blob commitments hash for a specific block number
   * @dev Returns the hash of all blob commitments for the block, used for data availability
   *      verification. Reverts if the block number is stale.
   * @param _blockNumber The block number to get the blob commitments hash for
   * @return The hash of blob commitments for the specified block
   */
  function getBlobCommitmentsHash(uint256 _blockNumber) internal view returns (bytes32) {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    return getStorage().tempBlockLogs[_blockNumber % size].blobCommitmentsHash;
  }

  /**
   * @notice Retrieves the slot number for a specific block number
   * @dev Returns the decompressed slot number indicating when the block was proposed.
   *      Reverts if the block number is stale.
   * @param _blockNumber The block number to get the slot number for
   * @return The slot number when the block was proposed
   */
  function getSlotNumber(uint256 _blockNumber) internal view returns (Slot) {
    (, uint256 size) = innerIsStale(_blockNumber, true);
    return getStorage().tempBlockLogs[_blockNumber % size].slotNumber.decompress();
  }

  /**
   * @notice Gets the effective pending block number based on pruning eligibility
   * @dev Returns either the pending block number or proven block number depending on
   *      whether pruning is allowed at the given timestamp. This is used to determine
   *      the effective chain tip for operations that should respect pruning windows.
   *
   *      If pruning is allowed: returns proven block number (chain should be pruned)
   *      If pruning is not allowed: returns pending block number (normal operation)
   * @param _timestamp The timestamp to evaluate pruning eligibility against
   * @return The effective block number that should be considered as the chain tip
   */
  function getEffectivePendingBlockNumber(Timestamp _timestamp) internal view returns (uint256) {
    RollupStore storage rollupStore = STFLib.getStorage();
    CompressedChainTips tips = rollupStore.tips;
    return STFLib.canPruneAtTime(_timestamp) ? tips.getProvenBlockNumber() : tips.getPendingBlockNumber();
  }

  /**
   * @notice Determines which epoch a block belongs to
   * @dev Calculates the epoch for a given block number by retrieving the block's slot
   *      and converting it to an epoch. Reverts if the block number exceeds the pending tip.
   * @param _blockNumber The block number to get the epoch for
   * @return The epoch containing the specified block
   */
  function getEpochForBlock(uint256 _blockNumber) internal view returns (Epoch) {
    RollupStore storage rollupStore = STFLib.getStorage();
    require(
      _blockNumber <= rollupStore.tips.getPendingBlockNumber(),
      Errors.Rollup__InvalidBlockNumber(rollupStore.tips.getPendingBlockNumber(), _blockNumber)
    );
    return getSlotNumber(_blockNumber).epochFromSlot();
  }

  /**
   * @notice Determines if the chain can be pruned at a given timestamp
   * @dev Checks whether the proof submission window has expired for the oldest pending blocks.
   *      Pruning is allowed when:
   *
   *      1. There are unproven blocks (pending > proven)
   *      2. The oldest pending epoch is no longer accepting proofs at the current epoch
   *
   *      The proof submission window is defined by the aztecProofSubmissionEpochs configuration,
   *      which specifies how many epochs after an epoch ends that proofs are still accepted.
   *
   *      Example timeline:
   *      - Block proposed in epoch N
   *      - Proof submission window = 2 epochs
   *      - Proof deadline = end of epoch N+2
   *      - If current time > epoch N+2, pruning is allowed
   *
   *      This mechanism ensures rollup liveness by preventing indefinite stalling on unproven blocks
   *      while providing sufficient time for proof generation and submission.
   *
   * @param _ts The current timestamp to check against
   * @return True if pruning is allowed at the given timestamp, false otherwise
   */
  function canPruneAtTime(Timestamp _ts) internal view returns (bool) {
    RollupStore storage rollupStore = STFLib.getStorage();

    CompressedChainTips tips = rollupStore.tips;

    if (tips.getPendingBlockNumber() == tips.getProvenBlockNumber()) {
      return false;
    }

    Epoch oldestPendingEpoch = getEpochForBlock(tips.getProvenBlockNumber() + 1);
    Epoch currentEpoch = _ts.epochFromTimestamp();

    return !oldestPendingEpoch.isAcceptingProofsAtEpoch(currentEpoch);
  }

  /**
   * @notice Retrieves the namespaced storage for the STFLib using EIP-7201 pattern
   * @dev Uses inline assembly to access storage at a specific slot calculated from the
   *      keccak256 hash of "aztec.stf.storage". This ensures storage isolation and
   *      prevents collisions with other contracts or libraries.
   *
   *      The storage contains:
   *      - Chain tips (pending and proven block numbers)
   *      - Archives mapping (permanent block archive storage)
   *      - TempBlockLogs mapping (circular buffer for temporary block data)
   *      - Rollup configuration
   * @return storageStruct A storage pointer to the RollupStore struct
   */
  function getStorage() internal pure returns (RollupStore storage storageStruct) {
    bytes32 position = STF_STORAGE_POSITION;
    assembly {
      storageStruct.slot := position
    }
  }
}
