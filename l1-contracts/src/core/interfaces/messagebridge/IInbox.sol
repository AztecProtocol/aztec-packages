// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DataStructures} from "../../libraries/DataStructures.sol";

/**
 * @title Inbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to pass messages into the rollup from L1.
 */
interface IInbox {
  struct InboxState {
    // Rolling hash of all messages inserted into the inbox.
    // Used by clients to check for consistency.
    // TODO: remove once the streaming inbox (AZIP-22 Fast Inbox) flips on and clients rely on the
    // consensus rolling hash tracked in the buckets instead.
    bytes16 rollingHash;
    // This value is not used much by the contract, but it is useful for synching the node faster
    // as it can more easily figure out if it can just skip looking for events for a time period.
    uint64 totalMessagesInserted;
    // Number of a tree which is currently being filled
    uint64 inProgress;
  }

  /**
   * @notice Snapshot of the consensus rolling hash over the messages inserted into the Inbox, stored in a
   * fixed-size ring indexed by a dense bucket sequence number (`seq % ringSize`). A bucket only accumulates
   * messages sent within a single L1 block, so its final state is the chain position as of the end of that
   * block; the censorship check at `propose` compares the checkpoint header's rolling hash against these
   * snapshots.
   */
  struct InboxBucket {
    // Rolling hash after the last message absorbed into this bucket. Each link is
    // `sha256ToField(previousRollingHash || leaf)`; the genesis value is zero.
    bytes32 rollingHash;
    // Cumulative number of messages inserted into the Inbox up to and including this bucket.
    uint64 totalMsgCount;
    // L1 block timestamp at which this bucket was opened. Recency comparisons (message lag,
    // censorship cutoff) are done in seconds against this value.
    uint64 timestamp;
    // Number of messages absorbed into this bucket, capped at the per-bucket maximum.
    uint32 msgCount;
  }

  /**
   * @notice Emitted when a message is sent
   * @param checkpointNumber - The checkpoint number in which the message is included
   * @param index - The index of the message in the L1 to L2 messages tree
   * @param hash - The hash of the message
   * @param rollingHash - The rolling hash of all messages inserted into the inbox
   * @param inboxRollingHash - The consensus rolling hash (truncated sha256 chain) after this message
   * @param bucketSeq - The sequence number of the bucket this message was absorbed into
   */
  event MessageSent(
    uint256 indexed checkpointNumber,
    uint256 index,
    bytes32 indexed hash,
    bytes16 rollingHash,
    bytes32 inboxRollingHash,
    uint256 bucketSeq
  );

  // docs:start:send_l1_to_l2_message
  /**
   * @notice Inserts a new message into the Inbox
   * @dev Emits `MessageSent` with data for easy access by the sequencer
   * @param _recipient - The recipient of the message
   * @param _content - The content of the message (application specific)
   * @param _secretHash - The secret hash of the message (make it possible to hide when a specific message is consumed
   * on L2)
   * @return The key of the message in the set and its leaf index in the tree
   */
  function sendL2Message(DataStructures.L2Actor memory _recipient, bytes32 _content, bytes32 _secretHash)
    external
    returns (bytes32, uint256);
  // docs:end:send_l1_to_l2_message

  // docs:start:consume
  /**
   * @notice Consumes the current tree, and starts a new one if needed
   * @dev Only callable by the rollup contract
   * @dev In the first iteration we return empty tree root because first checkpoint's messages tree is always
   * empty because there has to be a 1 checkpoint lag to prevent sequencer DOS attacks
   *
   * @param _toConsume - The checkpoint number to consume
   *
   * @return The root of the consumed tree
   */
  function consume(uint256 _toConsume) external returns (bytes32);
  // docs:end:consume

  function getFeeAssetPortal() external view returns (address);

  function getRoot(uint256 _checkpointNumber) external view returns (bytes32);

  function getState() external view returns (InboxState memory);

  function getTotalMessagesInserted() external view returns (uint64);

  function getInProgress() external view returns (uint64);

  /**
   * @notice Returns the sequence number of the bucket currently accumulating messages
   * @return The current bucket sequence number
   */
  function getCurrentBucketSeq() external view returns (uint64);

  /**
   * @notice Returns the bucket with the given sequence number
   * @dev Reverts if the bucket is ahead of the current one or has already been overwritten in the ring
   * @param _seq - The bucket sequence number
   * @return The bucket
   */
  function getBucket(uint256 _seq) external view returns (InboxBucket memory);
}
