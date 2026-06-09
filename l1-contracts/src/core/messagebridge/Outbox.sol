// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {BitMaps} from "@oz/utils/structs/BitMaps.sol";

// File-level integer literal so it can be used as a fixed-size array length (Solidity rejects
// dotted library-member access in array-length positions). MUST equal
// `Constants.MAX_CHECKPOINTS_PER_EPOCH`; the Outbox constructor enforces this at deploy time.
uint256 constant MAX_CHECKPOINTS_PER_EPOCH = 32;

/**
 * @title Outbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the Rollup
 * and will be consumed by the portal contracts.
 *
 * @dev Each epoch may accumulate multiple message roots when `insert` is called more than once
 * (e.g. when a partial epoch proof is followed by an extending proof). Roots are keyed by the
 * number of checkpoints proven in that epoch (`numCheckpointsInEpoch`, in [1, MAX_CHECKPOINTS_PER_EPOCH]),
 * so an off-chain consumer can map their L2 transaction's position-within-epoch directly to the
 * smallest proof that covers it without needing to recover that count from chain history.
 *
 * The nullifier bitmap is shared across every root of the same epoch, so a message consumed against
 * one root cannot be replayed against another root of the same epoch.
 *
 * Messages are tracked using unique leaf IDs computed from their position in the epoch's tree structure.
 * This design ensures that when longer epoch proofs are submitted (proving more checkpoints), messages
 * from earlier checkpoints retain their consumed status because their leaf IDs remain stable.
 *
 * @dev The Outbox does not (and cannot) verify on chain that a given message has the same leaf id
 * across two different roots of the same epoch. Leaf-id stability across extending partial-epoch
 * proofs is a property the rollup's proving system is expected to uphold (each checkpoint's subtree
 * is built only from its own messages, and the epoch tree is padded to a fixed size, so positions
 * of already-included messages are preserved when more checkpoints are added). A buggy or malicious
 * rollup that submitted two proofs for the same epoch where the same message lived at different
 * positions would, on the Outbox side, produce two different leaf ids on the shared bitmap and
 * therefore allow that message to be consumed twice. This is the same trust boundary the Outbox
 * has always had with the rollup; AZIP-14 does not extend it.
 *
 * For detailed information about the tree structure and leaf ID computation, see:
 * yarn-project/stdlib/src/messaging/l2_to_l1_membership.ts
 */
contract Outbox is IOutbox {
  using Hash for DataStructures.L2ToL1Msg;
  using BitMaps for BitMaps.BitMap;

  struct EpochData {
    // Slot `i` holds the epoch-tree out-hash root for `numCheckpointsInEpoch = i + 1` (i.e. the
    // proof that covered the first `i + 1` checkpoints of this epoch). Unset slots read as zero.
    // The array is sized at MAX_CHECKPOINTS_PER_EPOCH because that is the maximum number of
    // checkpoints the rollup ever proves in a single epoch.
    bytes32[MAX_CHECKPOINTS_PER_EPOCH] roots;
    // Bitmap tracking which messages (by leaf ID) have been consumed within this epoch.
    // The bitmap is shared across every root of the epoch: a message consumed against one
    // root cannot be replayed against another root for the same epoch.
    // Leaf IDs are stable across different epoch proof lengths, ensuring consumed
    // messages remain marked as consumed when longer proofs are submitted.
    BitMaps.BitMap nullified;
  }

  IRollup public immutable ROLLUP;
  uint256 public immutable VERSION;
  mapping(Epoch epoch => EpochData epochData) internal epochs;

  constructor(address _rollup, uint256 _version) {
    // Keep the file-level literal in lockstep with the generated constant. If this ever fires,
    // update MAX_CHECKPOINTS_PER_EPOCH at the top of this file (and IOutbox.sol).
    require(
      MAX_CHECKPOINTS_PER_EPOCH == Constants.MAX_CHECKPOINTS_PER_EPOCH,
      Errors.Outbox__InvalidNumCheckpointsInEpoch(MAX_CHECKPOINTS_PER_EPOCH)
    );

    ROLLUP = IRollup(_rollup);
    VERSION = _version;
  }

  /**
   * @notice Inserts the root of a merkle tree containing all of the L2 to L1 messages in an epoch
   *
   * @dev Only callable by the rollup contract
   * @dev Emits `RootAdded` upon inserting the root successfully
   *
   * @dev `_numCheckpointsInEpoch` identifies which partial-proof depth this root corresponds to:
   * the rollup proved the first `_numCheckpointsInEpoch` checkpoints of `_epoch`. A subsequent
   * insert for the same epoch with a larger `_numCheckpointsInEpoch` adds a new entry without
   * disturbing earlier ones, so users with witnesses built against an earlier partial proof can
   * still consume them.
   *
   * @param _epoch - The epoch in which the L2 to L1 messages reside
   * @param _numCheckpointsInEpoch - The number of checkpoints the inserting proof covered in this
   * epoch. Must be in [1, MAX_CHECKPOINTS_PER_EPOCH]. Values outside that range will revert.
   * @param _root - The merkle root of the tree where all the L2 to L1 messages are leaves
   */
  function insert(Epoch _epoch, uint256 _numCheckpointsInEpoch, bytes32 _root) external override(IOutbox) {
    require(msg.sender == address(ROLLUP), Errors.Outbox__Unauthorized());
    require(
      _numCheckpointsInEpoch >= 1 && _numCheckpointsInEpoch <= MAX_CHECKPOINTS_PER_EPOCH,
      Errors.Outbox__InvalidNumCheckpointsInEpoch(_numCheckpointsInEpoch)
    );

    epochs[_epoch].roots[_numCheckpointsInEpoch - 1] = _root;

    emit RootAdded(_epoch, _numCheckpointsInEpoch, _root);
  }

  /**
   * @notice Consumes an entry from the Outbox
   *
   * @dev Only useable by portals / recipients of messages
   * @dev Emits `MessageConsumed` when consuming messages
   *
   * @param _message - The L2 to L1 message
   * @param _epoch - The epoch that contains the message we want to consume
   * @param _numCheckpointsInEpoch - The number of checkpoints in the partial proof whose root this
   * consume verifies against. The caller's witness `_path` must have been built against the epoch
   * tree padded to that number of real checkpoints.
   * @param _leafIndex - The index at the level in the wonky tree where the message is located
   * @param _path - The sibling path used to prove inclusion of the message, the _path length depends
   * on the location of the L2 to L1 message in the wonky tree.
   */
  function consume(
    DataStructures.L2ToL1Msg calldata _message,
    Epoch _epoch,
    uint256 _numCheckpointsInEpoch,
    uint256 _leafIndex,
    bytes32[] calldata _path
  ) external override(IOutbox) {
    require(_path.length < 256, Errors.Outbox__PathTooLong());
    require(_leafIndex < (1 << _path.length), Errors.Outbox__LeafIndexOutOfBounds(_leafIndex, _path.length));
    require(_message.sender.version == VERSION, Errors.Outbox__VersionMismatch(_message.sender.version, VERSION));

    require(
      msg.sender == _message.recipient.actor, Errors.Outbox__InvalidRecipient(_message.recipient.actor, msg.sender)
    );

    require(block.chainid == _message.recipient.chainId, Errors.Outbox__InvalidChainId());

    require(
      _numCheckpointsInEpoch >= 1 && _numCheckpointsInEpoch <= MAX_CHECKPOINTS_PER_EPOCH,
      Errors.Outbox__NothingToConsumeAtEpoch(_epoch)
    );

    EpochData storage epochData = epochs[_epoch];
    bytes32 root = epochData.roots[_numCheckpointsInEpoch - 1];

    // A zero root means no proof was ever inserted for this `_numCheckpointsInEpoch`.
    require(root != bytes32(0), Errors.Outbox__NothingToConsumeAtEpoch(_epoch));

    // Compute the unique leaf ID for this message.
    uint256 leafId = (1 << _path.length) + _leafIndex;

    require(!epochData.nullified.get(leafId), Errors.Outbox__AlreadyNullified(_epoch, leafId));

    bytes32 messageHash = _message.sha256ToField();

    MerkleLib.verifyMembership(_path, messageHash, _leafIndex, root);

    epochData.nullified.set(leafId);

    emit MessageConsumed(_epoch, root, messageHash, leafId, _numCheckpointsInEpoch);
  }

  /**
   * @notice Checks to see if an L2 to L1 message in a specific epoch has been consumed
   *
   * @dev - This function does not throw. Out-of-bounds access is considered valid, but will always return false
   *
   * @param _epoch - The epoch that contains the message we want to check
   * @param _leafId - The unique id of the message leaf
   *
   * @return bool - True if the message has been consumed, false otherwise
   */
  function hasMessageBeenConsumedAtEpoch(Epoch _epoch, uint256 _leafId) external view override(IOutbox) returns (bool) {
    return epochs[_epoch].nullified.get(_leafId);
  }

  /**
   * @notice  Fetch the root data for a given epoch and partial-proof depth
   *          Returns 0 if no proof has been inserted at that depth (or if the depth is out of range)
   *
   * @param _epoch - The epoch to fetch the root data for
   * @param _numCheckpointsInEpoch - The number of checkpoints in the partial proof whose root to fetch
   *
   * @return bytes32 - The root of the merkle tree containing the L2 to L1 messages
   */
  function getRootData(Epoch _epoch, uint256 _numCheckpointsInEpoch) external view override(IOutbox) returns (bytes32) {
    if (_numCheckpointsInEpoch == 0 || _numCheckpointsInEpoch > MAX_CHECKPOINTS_PER_EPOCH) {
      return bytes32(0);
    }
    return epochs[_epoch].roots[_numCheckpointsInEpoch - 1];
  }

  /**
   * @notice  Fetch every root stored for a given epoch. The returned array has
   *          MAX_CHECKPOINTS_PER_EPOCH entries; slot `i` holds the root for
   *          `numCheckpointsInEpoch = i + 1`, or zero if no proof of that depth has been inserted.
   *
   * @param _epoch - The epoch to fetch the roots for
   *
   * @return bytes32[] - The roots stored for this epoch.
   */
  function getRoots(Epoch _epoch) external view override(IOutbox) returns (bytes32[MAX_CHECKPOINTS_PER_EPOCH] memory) {
    return epochs[_epoch].roots;
  }
}
