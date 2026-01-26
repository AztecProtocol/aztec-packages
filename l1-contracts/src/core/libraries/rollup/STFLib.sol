// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {RollupStore, IRollupCore, GenesisState} from "@aztec/core/interfaces/IRollup.sol";
import {
  CompressedTempCheckpointLog,
  TempCheckpointLog,
  CompressedTempCheckpointLogLib
} from "@aztec/core/libraries/compressed-data/CheckpointLog.sol";
import {CompressedFeeHeader, FeeHeaderLib, FeeHeader} from "@aztec/core/libraries/compressed-data/fees/FeeStructs.sol";
import {ChainTipsLib, CompressedChainTips} from "@aztec/core/libraries/compressed-data/Tips.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {CompressedSlot, CompressedTimeMath} from "@aztec/shared/libraries/CompressedTimeMath.sol";

/**
 * @title STFLib - State Transition Function Library
 * @author Aztec Labs
 * @notice Core library responsible for managing the rollup state transition function and checkpoint storage.
 *
 * @dev This library implements the essential state management functionality for the Aztec rollup, including:
 *      - Archive root storage indexed by checkpoint number for permanent state history
 *      - Circular storage for temporary checkpoint logs
 *      - Checkpoint pruning mechanism to remove unproven checkpoints after proof submission window expires
 *      - Namespaced storage pattern following EIP-7201 for secure storage isolation
 *
 *      Storage Architecture:
 *      - Uses EIP-7201 namespaced storage
 *      - Archives mapping: permanent storage of proven checkpoint archive roots
 *      - TempCheckpointLogs: circular buffer storing temporary checkpoint data (gets overwritten after N checkpoints)
 *      - Tips: tracks both pending (latest proposed) and proven (latest with valid proof) checkpoint numbers
 *
 *      Circular Storage ("Roundabout") Pattern:
 *      - The temporary checkpoint logs use a circular storage pattern where checkpoints are stored at index
 *        (checkpointNumber % roundaboutSize).
 *        This reuses storage slots for old checkpoints that have been proven or pruned.
 *        The roundabout size is calculated as maxPrunableCheckpoints() + 1 to ensure at least the last proven
 *        checkpoint remains accessible even after pruning operations. This saves gas costs by minimizing storage writes
 *         to fresh slots.
 *
 *      Pruning Mechanism:
 *      - Checkpoints become eligible for pruning when their proof submission window expires. The proof submission
 *        window is defined as a configurable number of epochs after the epoch containing the checkpoint.
 *        When pruning occurs, all unproven checkpoints are removed from the pending chain, and the chain
 *        resumes from the last proven checkpoint.
 *      - Rationale for pruning is that an epoch may contain a checkpoint that provers cannot prove. Pruning allows us
 *        to trade a large reorg for chain liveness, by removing potential unprovable checkpoints so we can continue.
 *      - A prover may not be able to prove a checkpoint if the transaction data for that checkpoint is not available.
 *        Transaction data is NOT posted to DA since transactions (along with their Chonk proofs) are big, and it would
 *        be too costly to submit everything to checkpoints. So we count on the committee to attest to the availability
 *        of that data, but if for some reason the data does not reach provers via p2p, then provers will not be able to
 *        prove.
 *
 *      Security Considerations:
 *      - Archive roots provide immutable history of proven state transitions
 *      - Circular storage saves gas while maintaining necessary data
 *      - Proof submission windows ensure liveness by preventing indefinite stalling
 *      - EIP-7201 namespaced storage prevents accidental storage collisions with other contracts
 *
 * @dev TempCheckpointLog Structure
 *
 *      The TempCheckpointLog struct represents temporary checkpoint data stored in the circular buffer
 *      until checkpoints overwritten. It contains:
 *
 *      Fields:
 *      - headerHash: Hash of the complete checkpoint header containing all checkpoint metadata
 *      - blobCommitmentsHash: Hash of all blob commitments used for data availability verification
 *      - attestationsHash: Hash of committee member attestations validating the checkpoint
 *      - payloadDigest: Digest of the proposal payload that committee members attested to
 *      - slotNumber: The specific slot when this checkpoint was proposed (determines epoch assignment)
 *      - feeHeader: Compressed fee information including base fees and mana pricing
 *
 *      Storage Optimization:
 *      The struct is stored in compressed format (CompressedTempCheckpointLog) to minimize gas costs.
 *      Compression primarily affects the slotNumber (reduced from 256-bit to smaller representation)
 *      and feeHeader (packed fee components). Other fields remain as 32-byte hashes.
 */
library STFLib {
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using TimeLib for Timestamp;
  using CompressedTimeMath for CompressedSlot;
  using ChainTipsLib for CompressedChainTips;
  using CompressedTempCheckpointLogLib for CompressedTempCheckpointLog;
  using CompressedTempCheckpointLogLib for TempCheckpointLog;
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
   *        - protocolContractsHash: Root containing protocol contract addresses and configurations
   *        - genesisArchiveRoot: Initial archive root representing the genesis state
   */
  function initialize(GenesisState memory _genesisState) internal {
    RollupStore storage rollupStore = STFLib.getStorage();

    rollupStore.config.vkTreeRoot = _genesisState.vkTreeRoot;
    rollupStore.config.protocolContractsHash = _genesisState.protocolContractsHash;

    rollupStore.archives[0] = _genesisState.genesisArchiveRoot;
  }

  /**
   * @notice Writes the genesis fee header at checkpoint 0
   * @dev This sets the initial ethPerFeeAsset value that will be used as the starting point
   *      for the fee asset price oracle. Must be called during rollup initialization.
   * @param _initialEthPerFeeAsset The initial ETH per fee asset price (with 1e12 precision)
   */
  function writeGenesisFeeHeader(uint256 _initialEthPerFeeAsset) internal {
    RollupStore storage rollupStore = STFLib.getStorage();
    // Write to checkpoint 0's slot in the circular buffer
    rollupStore.tempCheckpointLogs[0] = TempCheckpointLog({
        headerHash: bytes32(0),
        blobCommitmentsHash: bytes32(0),
        outHash: bytes32(0),
        attestationsHash: bytes32(0),
        payloadDigest: bytes32(0),
        slotNumber: Slot.wrap(0),
        feeHeader: FeeHeader({
          excessMana: 0, manaUsed: 0, ethPerFeeAsset: _initialEthPerFeeAsset, congestionCost: 0, proverCost: 0
        })
      }).compress();
  }

  /**
   * @notice Stores a temporary checkpoint log in the circular storage buffer
   * @dev Compresses and stores checkpoint data at the appropriate index in the circular buffer.
   *      The storage index is calculated as (pending checkpoint % roundaboutSize) to implement
   *      the circular storage pattern.
   *      Don't need to check if storage is stale as always writing to freshest.
   *
   * @param _tempCheckpointLog The temporary checkpoint log containing header hash, attestations,
   *        blob commitments, payload digest, slot number, and fee information
   */
  function addTempCheckpointLog(TempCheckpointLog memory _tempCheckpointLog) internal {
    uint256 checkpointNumber = STFLib.getStorage().tips.getPending();
    uint256 size = roundaboutSize();
    getStorage().tempCheckpointLogs[checkpointNumber % size] = _tempCheckpointLog.compress();
  }

  /**
   * @notice Removes unproven checkpoints from the pending chain when proof submission window expires
   * @dev This function implements the pruning mechanism that maintains rollup liveness by removing
   *      checkpoints that cannot be proven within the configured time window. When called:
   *
   *      1. Identifies the gap between pending and proven checkpoint numbers
   *      2. Resets the pending chain tip to match the last proven checkpoint
   *      3. Effectively removes all unproven checkpoints from the pending chain
   *
   *      The pruning does not delete checkpoint data from storage but makes it inaccessible by
   *      updating the chain tips.
   *
   *      Pruning should only occur when the proof submission window has expired for pending
   *      checkpoints, which is validated by the calling function (typically through canPruneAtTime).
   *
   *      Emits PrunedPending event with the proven and previously pending checkpoint numbers.
   */
  function prune() internal {
    RollupStore storage rollupStore = STFLib.getStorage();
    CompressedChainTips tips = rollupStore.tips;
    uint256 pending = tips.getPending();

    // @note  We are not deleting the checkpoints, but we are "winding back" the pendingTip to the last checkpoint that
    //        was proven.
    //        We can do because any new checkpoint proposed will overwrite a previous checkpoint in the checkpoint log,
    //        so no values should "survive".
    //        People must therefore read the chain using the pendingTip as a boundary.
    uint256 proven = tips.getProven();
    rollupStore.tips = tips.updatePending(proven);

    emit IRollupCore.PrunedPending(proven, pending);
  }

  /**
   * @notice Calculates the size of the circular storage buffer for temporary checkpoint logs
   * @dev The roundabout size determines how many checkpoints can be stored in the circular buffer
   *      before older entries are overwritten. The size is calculated as:
   *
   *      roundaboutSize = maxPrunableCheckpoints() + 1
   *
   *      Where maxPrunableCheckpoints() = epochDuration * (proofSubmissionEpochs + 1)
   *
   *      This ensures that:
   *      - All checkpoints within the proof submission window remain accessible
   *      - At least the last proven checkpoint is available as a trusted anchor
   *
   * @return The number of slots in the circular storage buffer
   */
  function roundaboutSize() internal view returns (uint256) {
    // Must be ensured to contain at least the last proven checkpoint even after a prune.
    return TimeLib.maxPrunableCheckpoints() + 1;
  }

  /**
   * @notice Returns a storage reference to a compressed temporary checkpoint log
   * @dev Provides direct access to the compressed checkpoint log in storage without decompression.
   *      Reverts if the checkpoint number is stale (no longer accessible in circular storage) or if
   *      the checkpoint have not happened yet.
   *
   * @dev A temporary checkpoint log is stale if it can no longer be accessed in the circular storage buffer.
   *      The staleness is determined by the relationship between the checkpoint number, current pending
   *      checkpoint, and the buffer size.
   *
   *      Example with roundabout size 5 and pending checkpoint 7:
   *      Circular buffer state: [checkpoint5, checkpoint6, checkpoint7, checkpoint3, checkpoint4]
   *
   *      A checkpoint is available if:
   *      - checkpointNumber <= pending  (it is not in the future)
   *      - pending < checkpointNumber + size (the override is in the future)
   *      Together as a span:
   *      - checkpointNumber <= pending < checkpointNumber + size
   *
   *      For example, checkpoint 2 is unavailable since the override has happened:
   *      - 2 <= 7 (true) && 7 < 2 + 5 (false)
   *      But checkpoint 3 is available as it in the past, but not overridden yet
   *      - 3 <= 7 (true) && 7 < 3 + 5 (true)
   *
   *      This ensures that only checkpoints within the current "window" of the circular buffer
   *      are considered valid and accessible.
   *
   * @param _checkpointNumber The checkpoint number to get the storage reference for
   * @return A storage reference to the compressed temporary checkpoint log
   */
  function getStorageTempCheckpointLog(uint256 _checkpointNumber)
    internal
    view
    returns (CompressedTempCheckpointLog storage)
  {
    uint256 pending = getStorage().tips.getPending();
    uint256 size = roundaboutSize();

    uint256 upperLimit = _checkpointNumber + size;
    bool available = _checkpointNumber <= pending && pending < upperLimit;
    require(available, Errors.Rollup__UnavailableTempCheckpointLog(_checkpointNumber, pending, upperLimit));

    return getStorage().tempCheckpointLogs[_checkpointNumber % size];
  }

  /**
   * @notice Retrieves and decompresses a temporary checkpoint log from circular storage
   * @dev Fetches the compressed checkpoint log from the circular buffer and decompresses it.
   *      Reverts if the checkpoint number is stale and no longer accessible.
   * @param _checkpointNumber The checkpoint number to retrieve the log for
   * @return The decompressed temporary checkpoint log containing all checkpoint metadata
   */
  function getTempCheckpointLog(uint256 _checkpointNumber) internal view returns (TempCheckpointLog memory) {
    return getStorageTempCheckpointLog(_checkpointNumber).decompress();
  }

  /**
   * @notice Retrieves the header hash for a specific checkpoint number
   * @dev Gas-efficient accessor that returns only the header hash without decompressing
   *      the entire checkpoint log. Reverts if the checkpoint number is stale.
   * @param _checkpointNumber The checkpoint number to get the header hash for
   * @return The header hash of the specified checkpoint
   */
  function getHeaderHash(uint256 _checkpointNumber) internal view returns (bytes32) {
    return getStorageTempCheckpointLog(_checkpointNumber).headerHash;
  }

  /**
   * @notice Retrieves the compressed fee header for a specific checkpoint number
   * @dev Returns the fee information including base fee components and mana costs.
   *      The data remains in compressed format for gas efficiency. Reverts if the checkpoint is stale.
   * @param _checkpointNumber The checkpoint number to get the fee header for
   * @return The compressed fee header containing fee-related data
   */
  function getFeeHeader(uint256 _checkpointNumber) internal view returns (CompressedFeeHeader) {
    return getStorageTempCheckpointLog(_checkpointNumber).feeHeader;
  }

  /**
   * @notice Retrieves the blob commitments hash for a specific checkpoint number
   * @dev Returns the hash of all blob commitments for the checkpoint, used for data availability
   *      verification. Reverts if the checkpoint number is stale.
   * @param _checkpointNumber The checkpoint number to get the blob commitments hash for
   * @return The hash of blob commitments for the specified checkpoint
   */
  function getBlobCommitmentsHash(uint256 _checkpointNumber) internal view returns (bytes32) {
    return getStorageTempCheckpointLog(_checkpointNumber).blobCommitmentsHash;
  }

  /**
   * @notice Retrieves the slot number for a specific checkpoint number
   * @dev Returns the decompressed slot number indicating when the checkpoint was proposed.
   *      Reverts if the checkpoint number is stale.
   * @param _checkpointNumber The checkpoint number to get the slot number for
   * @return The slot number when the checkpoint was proposed
   */
  function getSlotNumber(uint256 _checkpointNumber) internal view returns (Slot) {
    return getStorageTempCheckpointLog(_checkpointNumber).slotNumber.decompress();
  }

  /**
   * @notice Gets the effective pending checkpoint number based on pruning eligibility
   * @dev Returns either the pending checkpoint number or proven checkpoint number depending on
   *      whether pruning is allowed at the given timestamp. This is used to determine
   *      the effective chain tip for operations that should respect pruning windows.
   *
   *      If pruning is allowed: returns proven checkpoint number (chain should be pruned)
   *      If pruning is not allowed: returns pending checkpoint number (normal operation)
   * @param _timestamp The timestamp to evaluate pruning eligibility against
   * @return The effective checkpoint number that should be considered as the chain tip
   */
  function getEffectivePendingCheckpointNumber(Timestamp _timestamp) internal view returns (uint256) {
    RollupStore storage rollupStore = STFLib.getStorage();
    CompressedChainTips tips = rollupStore.tips;
    return STFLib.canPruneAtTime(_timestamp) ? tips.getProven() : tips.getPending();
  }

  /**
   * @notice Determines which epoch a checkpoint belongs to
   * @dev Calculates the epoch for a given checkpoint number by retrieving the checkpoint's slot
   *      and converting it to an epoch. Reverts if the checkpoint number exceeds the pending tip.
   * @param _checkpointNumber The checkpoint number to get the epoch for
   * @return The epoch containing the specified checkpoint
   */
  function getEpochForCheckpoint(uint256 _checkpointNumber) internal view returns (Epoch) {
    RollupStore storage rollupStore = STFLib.getStorage();
    require(
      _checkpointNumber <= rollupStore.tips.getPending(),
      Errors.Rollup__InvalidCheckpointNumber(rollupStore.tips.getPending(), _checkpointNumber)
    );
    return getSlotNumber(_checkpointNumber).epochFromSlot();
  }

  /**
   * @notice Determines if the chain can be pruned at a given timestamp
   * @dev Checks whether the proof submission window has expired for the oldest pending checkpoints.
   *      Pruning is allowed when:
   *
   *      1. There are unproven checkpoints (pending > proven)
   *      2. The oldest pending epoch is no longer accepting proofs at the epoch at _ts
   *
   *      The proof submission window is defined by the aztecProofSubmissionEpochs configuration,
   *      which specifies how many epochs after an epoch ends that proofs are still accepted.
   *
   *      Example timeline:
   *      - Checkpoint proposed in epoch N
   *      - Proof submission window = 1 epochs
   *      - Proof deadline epoch = N + Proof submission window + 1
   *          The deadline is the point in time where it is no longer acceptable, (if you touch the line you die)
   *      - If epoch(_ts) >= epoch N + Proof submission window + 1, pruning is allowed
   *
   *      This mechanism ensures rollup liveness by preventing indefinite stalling on unprovable checkpoints (e.g due to
   *      the committee failing to disseminate the data) while providing sufficient time for proof generation and
   *      submission.
   *
   * @param _ts The current timestamp to check against
   * @return True if pruning is allowed at the given timestamp, false otherwise
   */
  function canPruneAtTime(Timestamp _ts) internal view returns (bool) {
    RollupStore storage rollupStore = STFLib.getStorage();

    CompressedChainTips tips = rollupStore.tips;

    if (tips.getPending() == tips.getProven()) {
      return false;
    }

    Epoch oldestPendingEpoch = getEpochForCheckpoint(tips.getProven() + 1);
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
   *      - Chain tips (pending and proven checkpoint numbers)
   *      - Archives mapping (permanent checkpoint archive storage)
   *      - TempCheckpointLogs mapping (circular buffer for temporary checkpoint data)
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
