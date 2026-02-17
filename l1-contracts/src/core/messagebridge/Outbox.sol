// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {BitMaps} from "@oz/utils/structs/BitMaps.sol";

/**
 * @title Outbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the Rollup
 * and will be consumed by the portal contracts.
 *
 * @dev Messages are tracked using unique leaf IDs computed from their position in the epoch's tree structure.
 * This design ensures that when longer epoch proofs are submitted (proving more blocks), messages from
 * earlier blocks retain their consumed status because their leaf IDs remain stable.
 *
 * For detailed information about the tree structure and leaf ID computation, see:
 * yarn-project/stdlib/src/messaging/l2_to_l1_membership.ts
 */
contract Outbox is IOutbox {
  using Hash for DataStructures.L2ToL1Msg;
  using BitMaps for BitMaps.BitMap;

  struct RootData {
    // This is the outHash in the root rollup's public inputs.
    // It represents the root of the epoch tree containing all L2->L1 messages.
    bytes32 root;
    // Bitmap tracking which messages (by leaf ID) have been consumed.
    // Leaf IDs are stable across different epoch proof lengths, ensuring consumed
    // messages remain marked as consumed when longer proofs are submitted.
    BitMaps.BitMap nullified;
  }

  IRollup public immutable ROLLUP;
  uint256 public immutable VERSION;
  mapping(Epoch => RootData root) internal roots;

  constructor(address _rollup, uint256 _version) {
    ROLLUP = IRollup(_rollup);
    VERSION = _version;
  }

  /**
   * @notice Inserts the root of a merkle tree containing all of the L2 to L1 messages in an epoch
   *
   * @dev Only callable by the rollup contract
   * @dev Emits `RootAdded` upon inserting the root successfully
   *
   * @param _epoch - The epoch in which the L2 to L1 messages reside
   * @param _root - The merkle root of the tree where all the L2 to L1 messages are leaves
   */
  function insert(Epoch _epoch, bytes32 _root) external override(IOutbox) {
    require(msg.sender == address(ROLLUP), Errors.Outbox__Unauthorized());

    roots[_epoch].root = _root;

    emit RootAdded(_epoch, _root);
  }

  /**
   * @notice Consumes an entry from the Outbox
   *
   * @dev Only useable by portals / recipients of messages
   * @dev Emits `MessageConsumed` when consuming messages
   *
   * @param _message - The L2 to L1 message
   * @param _epoch - The epoch that contains the message we want to consume
   * @param _leafIndex - The index at the level in the wonky tree where the message is located
   * @param _path - The sibling path used to prove inclusion of the message, the _path length depends
   * on the location of the L2 to L1 message in the wonky tree.
   */
  function consume(
    DataStructures.L2ToL1Msg calldata _message,
    Epoch _epoch,
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

    RootData storage rootData = roots[_epoch];

    bytes32 root = rootData.root;

    require(root != bytes32(0), Errors.Outbox__NothingToConsumeAtEpoch(_epoch));

    // Compute the unique leaf ID for this message.
    uint256 leafId = (1 << _path.length) + _leafIndex;

    require(!rootData.nullified.get(leafId), Errors.Outbox__AlreadyNullified(_epoch, leafId));

    bytes32 messageHash = _message.sha256ToField();

    MerkleLib.verifyMembership(_path, messageHash, _leafIndex, root);

    rootData.nullified.set(leafId);

    emit MessageConsumed(_epoch, root, messageHash, leafId);
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
    return roots[_epoch].nullified.get(_leafId);
  }

  /**
   * @notice  Fetch the root data for a given epoch
   *          Returns (0, 0) if the epoch is not proven
   *
   * @param _epoch - The epoch to fetch the root data for
   *
   * @return bytes32 - The root of the merkle tree containing the L2 to L1 messages
   */
  function getRootData(Epoch _epoch) external view override(IOutbox) returns (bytes32) {
    RootData storage rootData = roots[_epoch];
    return rootData.root;
  }
}
