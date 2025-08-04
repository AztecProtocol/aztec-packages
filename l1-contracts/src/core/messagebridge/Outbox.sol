// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {MerkleLib} from "@aztec/core/libraries/crypto/MerkleLib.sol";
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {BitMaps} from "@oz/utils/structs/BitMaps.sol";

/**
 * @title Outbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the Rollup
 * and will be consumed by the portal contracts.
 */
contract Outbox is IOutbox {
  using Hash for DataStructures.L2ToL1Msg;
  using BitMaps for BitMaps.BitMap;

  struct RootData {
    // This is the outhash specified by header.globalvariables.outHash of any given block.
    bytes32 root;
    BitMaps.BitMap nullified;
  }

  IRollup public immutable ROLLUP;
  uint256 public immutable VERSION;
  mapping(uint256 l2BlockNumber => RootData root) internal roots;

  constructor(address _rollup, uint256 _version) {
    ROLLUP = IRollup(_rollup);
    VERSION = _version;
  }

  /**
   * @notice Inserts the root of a merkle tree containing all of the L2 to L1 messages in a block
   *
   * @dev Only callable by the rollup contract
   * @dev Emits `RootAdded` upon inserting the root successfully
   *
   * @param _l2BlockNumber - The L2 Block Number in which the L2 to L1 messages reside
   * @param _root - The merkle root of the tree where all the L2 to L1 messages are leaves
   */
  function insert(uint256 _l2BlockNumber, bytes32 _root) external override(IOutbox) {
    require(msg.sender == address(ROLLUP), Errors.Outbox__Unauthorized());

    roots[_l2BlockNumber].root = _root;

    emit RootAdded(_l2BlockNumber, _root);
  }

  /**
   * @notice Consumes an entry from the Outbox
   *
   * @dev Only useable by portals / recipients of messages
   * @dev Emits `MessageConsumed` when consuming messages
   *
   * @param _message - The L2 to L1 message
   * @param _l2BlockNumber - The block number specifying the block that contains the message we want to consume
   * @param _leafIndex - The index inside the merkle tree where the message is located
   * @param _path - The sibling path used to prove inclusion of the message, the _path length directly depends
   * on the total amount of L2 to L1 messages in the block. i.e. the length of _path is equal to the depth of the
   * L1 to L2 message tree.
   */
  function consume(
    DataStructures.L2ToL1Msg calldata _message,
    uint256 _l2BlockNumber,
    uint256 _leafIndex,
    bytes32[] calldata _path
  ) external override(IOutbox) {
    require(_l2BlockNumber <= ROLLUP.getProvenBlockNumber(), Errors.Outbox__BlockNotProven(_l2BlockNumber));
    require(_message.sender.version == VERSION, Errors.Outbox__VersionMismatch(_message.sender.version, VERSION));

    require(
      msg.sender == _message.recipient.actor, Errors.Outbox__InvalidRecipient(_message.recipient.actor, msg.sender)
    );

    require(block.chainid == _message.recipient.chainId, Errors.Outbox__InvalidChainId());

    RootData storage rootData = roots[_l2BlockNumber];

    bytes32 blockRoot = rootData.root;

    require(blockRoot != bytes32(0), Errors.Outbox__NothingToConsumeAtBlock(_l2BlockNumber));

    uint256 leafId = (1 << _path.length) + _leafIndex;

    require(!rootData.nullified.get(leafId), Errors.Outbox__AlreadyNullified(_l2BlockNumber, leafId));

    bytes32 messageHash = _message.sha256ToField();

    MerkleLib.verifyMembership(_path, messageHash, _leafIndex, blockRoot);

    rootData.nullified.set(leafId);

    emit MessageConsumed(_l2BlockNumber, blockRoot, messageHash, leafId);
  }

  /**
   * @notice Checks to see if an L2 to L1 message in a specific block has been consumed
   *
   * @dev - This function does not throw. Out-of-bounds access is considered valid, but will always return false
   *
   * @param _l2BlockNumber - The block number specifying the block that contains the message we want to check
   * @param _leafId - The unique id of the message leaf
   *
   * @return bool - True if the message has been consumed, false otherwise
   */
  function hasMessageBeenConsumedAtBlock(uint256 _l2BlockNumber, uint256 _leafId)
    external
    view
    override(IOutbox)
    returns (bool)
  {
    return roots[_l2BlockNumber].nullified.get(_leafId);
  }

  /**
   * @notice  Fetch the root data for a given block number
   *          Returns (0, 0) if the block is not proven
   *
   * @param _l2BlockNumber - The block number to fetch the root data for
   *
   * @return bytes32 - The root of the merkle tree containing the L2 to L1 messages
   */
  function getRootData(uint256 _l2BlockNumber) external view override(IOutbox) returns (bytes32) {
    if (_l2BlockNumber > ROLLUP.getProvenBlockNumber()) {
      return bytes32(0);
    }
    RootData storage rootData = roots[_l2BlockNumber];
    return rootData.root;
  }
}
