// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DataStructures} from "../../libraries/DataStructures.sol";

// Maximum number of messages a single bucket can hold before further messages in the same L1 block spill over
// into the next bucket. Matches the number of L1 to L2 messages a single L2 block can insert, so any one bucket
// is always consumable by one block.
uint256 constant MAX_MSGS_PER_BUCKET = 256;

/**
 * @title Inbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to pass messages into the rollup from L1.
 */
interface IInbox {
  // The Inbox's live position, read atomically in one call so a syncing node can compare its local view
  // (count and consensus rolling hash) against L1 without cross-call tearing, and skip scanning for events
  // when both match.
  struct InboxState {
    // Consensus rolling hash after the most recently inserted message (zero when none was ever inserted).
    bytes32 rollingHash;
    // Cumulative number of messages inserted into the inbox.
    uint64 totalMessagesInserted;
    // Sequence number of the bucket currently accumulating messages.
    uint64 currentBucketSeq;
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
   * @dev Carries the full message so the event is a self-contained record — reconstructing the fields from
   * calldata is unreliable for portals sending via internal calls. Hashing `message` yields the indexed `hash`,
   * and `message.index` is the compact cumulative index of the message in the Inbox insertion order.
   * @param hash - The hash of the message (the L1-to-L2 tree leaf)
   * @param inboxRollingHash - The consensus rolling hash (truncated sha256 chain) after this message
   * @param bucketSeq - The sequence number of the bucket this message was absorbed into
   * @param message - The full message
   */
  event MessageSent(
    bytes32 indexed hash, bytes32 inboxRollingHash, uint256 bucketSeq, DataStructures.L1ToL2Msg message
  );

  // docs:start:send_l1_to_l2_message
  /**
   * @notice Inserts a new message into the Inbox
   * @dev Emits `MessageSent` with data for easy access by the sequencer
   * @param _recipient - The recipient of the message
   * @param _content - The content of the message (application specific)
   * @param _secretHash - The secret hash of the message (make it possible to hide when a specific message is consumed
   * on L2)
   * @return The key of the message in the set and its compact cumulative index
   */
  function sendL2Message(DataStructures.L2Actor memory _recipient, bytes32 _content, bytes32 _secretHash)
    external
    returns (bytes32, uint256);
  // docs:end:send_l1_to_l2_message

  function getFeeAssetPortal() external view returns (address);

  function getState() external view returns (InboxState memory);

  function getTotalMessagesInserted() external view returns (uint64);

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
