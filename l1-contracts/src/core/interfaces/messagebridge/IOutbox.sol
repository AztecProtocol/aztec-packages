// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DataStructures} from "../../libraries/DataStructures.sol";
import {Epoch} from "../../libraries/TimeLib.sol";

// File-level integer literal so it can be used as a fixed-size array length. MUST equal
// `Constants.MAX_CHECKPOINTS_PER_EPOCH`; the Outbox constructor enforces this at deploy time.
uint256 constant MAX_CHECKPOINTS_PER_EPOCH = 32;

/**
 * @title IOutbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the Rollup
 * and will be consumed by the portal contracts.
 */
interface IOutbox {
  event RootAdded(Epoch indexed epoch, uint256 indexed numCheckpointsInEpoch, bytes32 root);
  event MessageConsumed(
    Epoch indexed epoch,
    bytes32 indexed root,
    bytes32 indexed messageHash,
    uint256 leafId,
    uint256 numCheckpointsInEpoch
  );

  // docs:start:outbox_insert
  /**
   * @notice Inserts the root of a merkle tree containing all of the L2 to L1 messages in an epoch
   *         after a proof covering the first `_numCheckpointsInEpoch` checkpoints of that epoch lands.
   * @dev Only callable by the rollup contract
   * @dev Emits `RootAdded` upon inserting the root successfully
   * @dev Successive inserts for the same epoch with larger `_numCheckpointsInEpoch` values do not
   * disturb earlier entries, so users with witnesses built against an earlier partial proof can still
   * consume them.
   * @param _epoch - The epoch in which the L2 to L1 messages reside
   * @param _numCheckpointsInEpoch - The number of checkpoints the inserting proof covered in this
   * epoch. Must be in [1, MAX_CHECKPOINTS_PER_EPOCH].
   * @param _root - The merkle root of the tree where all the L2 to L1 messages are leaves
   */
  function insert(Epoch _epoch, uint256 _numCheckpointsInEpoch, bytes32 _root) external;
  // docs:end:outbox_insert

  // docs:start:outbox_consume
  /**
   * @notice Consumes an entry from the Outbox
   * @dev Only useable by portals / recipients of messages
   * @dev Emits `MessageConsumed` when consuming messages
   * @param _message - The L2 to L1 message
   * @param _epoch - The epoch that contains the message we want to consume
   * @param _numCheckpointsInEpoch - The number of checkpoints in the partial proof whose root this
   * consume verifies against. The caller's witness path must have been built against the epoch tree
   * padded to that number of real checkpoints.
   * @param _leafIndex - The index at the level in the epoch message tree where the message is located
   * @param _path - The sibling path used to prove inclusion of the message, the _path length depends
   * on the location of the L2 to L1 message in the epoch message tree.
   */
  function consume(
    DataStructures.L2ToL1Msg calldata _message,
    Epoch _epoch,
    uint256 _numCheckpointsInEpoch,
    uint256 _leafIndex,
    bytes32[] calldata _path
  ) external;
  // docs:end:outbox_consume

  // docs:start:outbox_has_message_been_consumed_at_epoch_and_index
  /**
   * @notice Checks to see if an L2 to L1 message in a specific epoch has been consumed
   * @dev - This function does not throw. Out-of-bounds access is considered valid, but will always return false
   * @param _epoch - The epoch that contains the message we want to check
   * @param _leafId - The unique id of the message leaf
   */
  function hasMessageBeenConsumedAtEpoch(Epoch _epoch, uint256 _leafId) external view returns (bool);
  // docs:end:outbox_has_message_been_consumed_at_epoch_and_index

  /**
   * @notice  Fetch the root data for a given epoch and partial-proof depth.
   *          Returns 0 if no proof has been inserted at that depth.
   *
   * @param _epoch - The epoch to fetch the root data for
   * @param _numCheckpointsInEpoch - The number of checkpoints in the partial proof whose root to fetch
   *
   * @return bytes32 - The root of the merkle tree containing the L2 to L1 messages
   */
  function getRootData(Epoch _epoch, uint256 _numCheckpointsInEpoch) external view returns (bytes32);

  /**
   * @notice  Fetch every root stored for a given epoch. The returned array has
   *          MAX_CHECKPOINTS_PER_EPOCH entries; slot `i` holds the root for
   *          `numCheckpointsInEpoch = i + 1`, or zero if no proof of that depth has been inserted.
   *
   * @param _epoch - The epoch to fetch the roots for
   *
   * @return bytes32[] - The roots stored for this epoch.
   */
  function getRoots(Epoch _epoch) external view returns (bytes32[MAX_CHECKPOINTS_PER_EPOCH] memory);
}
