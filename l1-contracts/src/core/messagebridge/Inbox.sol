// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IInbox, MAX_MSGS_PER_BUCKET} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

// Number of buckets in the rolling-hash ring. Eviction is gated on proven consumption, so the ring has to
// cover the worst-case proving lag (~2 epochs of one bucket per L1 block, which is what MIN_BUCKET_RING_SIZE
// below is derived from) with enough margin that adversarial bucket creation cannot cheaply exhaust it: a
// forced rollover costs ~2.2M gas, so burning this much headroom takes ~250 continuously-owned L1 blocks
// (~50 min, ~9B gas). Ring size bounds retention only — 2 storage slots per live bucket, no per-send gas — and
// exhausting it halts sends rather than overwriting unconsumed buckets.
uint256 constant INBOX_BUCKET_RING_SIZE = 4096;

// Constructor floor for the bucket ring. The ring must cover the longest stall the chain recovers from on
// its own: the prune-and-repropose window of 64 checkpoints (2 epochs = 384 L1 blocks) at the natural cadence
// of one bucket per L1 block, so the buckets it must re-consume after a prune have not been overwritten. 384
// rounded up to the next power of two, kept at or below the production ring.
uint256 constant MIN_BUCKET_RING_SIZE = 512;

/**
 * @title Inbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to pass messages into the rollup, e.g., L1 -> L2 messages.
 */
contract Inbox is IInbox {
  using Hash for DataStructures.L1ToL2Msg;

  address public immutable ROLLUP;
  uint256 public immutable VERSION;
  address public immutable FEE_ASSET_PORTAL;

  uint256 public immutable BUCKET_RING_SIZE;

  // Ring of rolling-hash buckets, keyed by `bucketSeq % BUCKET_RING_SIZE`. Consumed by the streaming inbox
  // checks at `propose`.
  mapping(uint256 ringIndex => InboxBucket bucket) internal buckets;

  uint64 internal currentBucketSeq;

  // Sequence number of the newest bucket consumed by the proven chain, pushed by the Rollup on every proven-tip
  // advance. Anchoring eviction to proven consumption is prune-immune (the proven tip never rewinds) and
  // fail-closed (the cache can only lag the truth). Shares a slot with currentBucketSeq so the overwrite check
  // reads it warm.
  uint64 internal provenConsumedBucketSeq;

  constructor(address _rollup, IERC20 _feeAsset, uint256 _version, uint256 _bucketRingSize) {
    ROLLUP = _rollup;
    VERSION = _version;

    require(_bucketRingSize >= MIN_BUCKET_RING_SIZE, "BUCKET RING TOO SMALL");
    BUCKET_RING_SIZE = _bucketRingSize;

    // Genesis bucket: a checkpoint consuming no messages references the same bucket as its parent, so the
    // first checkpoint against an empty Inbox references this one and no base case leaks into `propose`.
    buckets[0] =
      InboxBucket({rollingHash: 0, totalMsgCount: 0, timestamp: SafeCast.toUint64(block.timestamp), msgCount: 0});

    FEE_ASSET_PORTAL = address(new FeeJuicePortal(IRollup(_rollup), _feeAsset, IInbox(this), VERSION));
  }

  /**
   * @notice Inserts a new message into the Inbox
   *
   * @dev Emits `MessageSent` with data for easy access by the sequencer
   *
   * @param _recipient - The recipient of the message
   * @param _content - The content of the message (application specific)
   * @param _secretHash - The secret hash of the message (make it possible to hide when a specific message is consumed
   * on L2)
   *
   * @return Hash of the sent message and its compact cumulative index.
   */
  function sendL2Message(DataStructures.L2Actor memory _recipient, bytes32 _content, bytes32 _secretHash)
    external
    override(IInbox)
    returns (bytes32, uint256)
  {
    require(uint256(_recipient.actor) <= Constants.MAX_FIELD_VALUE, Errors.Inbox__ActorTooLarge(_recipient.actor));
    require(_recipient.version == VERSION, Errors.Inbox__VersionMismatch(_recipient.version, VERSION));
    require(uint256(_content) <= Constants.MAX_FIELD_VALUE, Errors.Inbox__ContentTooLarge(_content));
    require(uint256(_secretHash) <= Constants.MAX_FIELD_VALUE, Errors.Inbox__SecretHashTooLarge(_secretHash));

    // Compact cumulative message index: the zero-based position of this message in the Inbox's
    // insertion order, equal to the number of messages inserted before it. It matches the streaming L1-to-L2 tree's
    // leaf count, so consumers do not need per-checkpoint tree geometry. Sourced from the current bucket's running
    // total, which the absorb below then advances (a rollover carries the total forward unchanged).
    uint256 index = _totalMessagesInserted();

    // If the sender is the fee asset portal, we use a magic address to simpler have it initialized at genesis.
    // We assume that no-one will know the private key for this address and that the precompile won't change to
    // make calls into arbitrary contracts.
    address senderAddress = msg.sender == FEE_ASSET_PORTAL ? address(uint160(Constants.FEE_JUICE_ADDRESS)) : msg.sender;

    DataStructures.L1ToL2Msg memory message = DataStructures.L1ToL2Msg({
      sender: DataStructures.L1Actor(senderAddress, block.chainid),
      recipient: _recipient,
      content: _content,
      secretHash: _secretHash,
      index: index
    });

    bytes32 leaf = message.sha256ToField();

    (uint64 bucketSeq, bytes32 inboxRollingHash) = _absorbIntoBucket(leaf);

    emit MessageSent(leaf, inboxRollingHash, bucketSeq, message);

    return (leaf, index);
  }

  /**
   * @notice Records that the proven chain has consumed all messages up to and including bucket `_bucketSeq`
   *
   * @dev Callable only by the ROLLUP. Monotonic: a value at or below the current record is a no-op. Reverts if
   * `_bucketSeq` is ahead of the current bucket.
   *
   * @param _bucketSeq - The sequence number of the newest bucket the proven chain has consumed
   */
  function markProvenConsumed(uint64 _bucketSeq) external override(IInbox) {
    require(msg.sender == ROLLUP, Errors.Inbox__Unauthorized());
    require(_bucketSeq <= currentBucketSeq, Errors.Inbox__BucketOutOfWindow(_bucketSeq, currentBucketSeq));
    if (_bucketSeq > provenConsumedBucketSeq) {
      provenConsumedBucketSeq = _bucketSeq;
    }
  }

  function getFeeAssetPortal() external view override(IInbox) returns (address) {
    return FEE_ASSET_PORTAL;
  }

  function getState() external view override(IInbox) returns (InboxState memory) {
    uint64 seq = currentBucketSeq;
    InboxBucket storage bucket = buckets[seq % BUCKET_RING_SIZE];
    return
      InboxState({rollingHash: bucket.rollingHash, totalMessagesInserted: bucket.totalMsgCount, currentBucketSeq: seq});
  }

  function getTotalMessagesInserted() external view override(IInbox) returns (uint64) {
    return _totalMessagesInserted();
  }

  function getCurrentBucketSeq() external view override(IInbox) returns (uint64) {
    return currentBucketSeq;
  }

  function getBucket(uint256 _seq) external view override(IInbox) returns (InboxBucket memory) {
    uint256 current = currentBucketSeq;
    require(_seq <= current && current - _seq < BUCKET_RING_SIZE, Errors.Inbox__BucketOutOfWindow(_seq, current));
    return buckets[_seq % BUCKET_RING_SIZE];
  }

  function getProvenConsumedBucketSeq() external view override(IInbox) returns (uint64) {
    return provenConsumedBucketSeq;
  }

  /**
   * @notice Returns the number of buckets that can still be opened before sends revert to protect an unconsumed
   * bucket from being overwritten
   *
   * @dev Counts bucket openings, not messages: at zero, messages can still be absorbed into the current bucket
   * until it fills or its L1 block passes. Neither subtraction can underflow: `markProvenConsumed` keeps the
   * record at or below `currentBucketSeq`, and opening bucket n requires `provenConsumedBucketSeq >= n -
   * BUCKET_RING_SIZE`, so the unconsumed span never exceeds the ring.
   *
   * @return The number of buckets that can still be opened
   */
  function getRingHeadroom() external view override(IInbox) returns (uint256) {
    return BUCKET_RING_SIZE - (currentBucketSeq - provenConsumedBucketSeq);
  }

  /**
   * @notice Absorbs a message leaf into the consensus rolling hash and snapshots it into the bucket ring
   *
   * @dev A bucket only holds messages from a single L1 block, up to MAX_MSGS_PER_BUCKET; the first message
   * of a new L1 block — or the message after a full bucket, spilling over within the same block — opens the
   * next bucket, inheriting the rolling hash and cumulative count. Bucket 0 is the pristine genesis base
   * case and never absorbs. Opening a bucket overwrites the ring entry from BUCKET_RING_SIZE buckets ago; the
   * open reverts unless the proven chain has consumed that entry, so in-flight messages are never destroyed —
   * sends halt instead until proving catches up.
   *
   * The first message of a bucket is tagged with its own domain separator in the rolling hash, so the chain
   * commits to the bucket boundaries and not just to the message order.
   *
   * @param _leaf - The message leaf to absorb
   *
   * @return The sequence number of the bucket the leaf was absorbed into and the updated rolling hash
   */
  function _absorbIntoBucket(bytes32 _leaf) internal returns (uint64, bytes32) {
    uint64 bucketSeq = currentBucketSeq;
    InboxBucket memory bucket = buckets[bucketSeq % BUCKET_RING_SIZE];

    // Buckets are keyed by L1 block timestamp: a strictly larger timestamp opens a new bucket (a full bucket
    // also rolls over within the same block). Post-merge Ethereum increases block.timestamp strictly per block,
    // so messages from different L1 blocks always land in different buckets. Under anvil with manual mining two
    // blocks can share a timestamp and therefore a bucket; this is harmless because the consumption cutoff is
    // computed over timestamps, so co-timestamped blocks are indistinguishable to it.
    if (bucketSeq == 0 || bucket.timestamp < block.timestamp || bucket.msgCount == MAX_MSGS_PER_BUCKET) {
      bucketSeq += 1;
      if (bucketSeq >= BUCKET_RING_SIZE) {
        uint64 evictedBucketSeq = SafeCast.toUint64(bucketSeq - BUCKET_RING_SIZE);
        require(
          provenConsumedBucketSeq >= evictedBucketSeq, Errors.Inbox__WouldOverwriteUnconsumedBucket(evictedBucketSeq)
        );
      }
      currentBucketSeq = bucketSeq;
      bucket = InboxBucket({
        rollingHash: bucket.rollingHash,
        totalMsgCount: bucket.totalMsgCount,
        timestamp: SafeCast.toUint64(block.timestamp),
        msgCount: 0
      });
    }

    bucket.rollingHash = Hash.accumulateInboxRollingHash(bucket.rollingHash, _leaf, bucket.msgCount == 0);
    bucket.totalMsgCount += 1;
    bucket.msgCount += 1;
    buckets[bucketSeq % BUCKET_RING_SIZE] = bucket;

    return (bucketSeq, bucket.rollingHash);
  }

  // Cumulative number of messages inserted into the Inbox, tracked by the current bucket's running total.
  function _totalMessagesInserted() internal view returns (uint64) {
    return buckets[currentBucketSeq % BUCKET_RING_SIZE].totalMsgCount;
  }
}
