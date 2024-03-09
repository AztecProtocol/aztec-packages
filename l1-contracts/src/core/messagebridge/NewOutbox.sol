// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

// Libraries
import {DataStructures} from "../libraries/DataStructures.sol";
import {Errors} from "../libraries/Errors.sol";
import {Merkle} from "../libraries/Merkle.sol";
import {Hash} from "../libraries/Hash.sol";
import {INewOutbox} from "../interfaces/messagebridge/INewOutbox.sol";

/**
 * @title NewOutbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the state transitioner
 * and will be consumed by the portal contracts.
 */
contract NewOutbox is INewOutbox {
  using Hash for DataStructures.L2ToL1Msg;

  struct RootData {
    bytes32 root;
    uint256 height;
    mapping(uint256 => bool) nullified;
  }

  address public immutable STATE_TRANSITIONER;
  mapping(uint256 l2BlockNumber => RootData) public roots;

  constructor(address _stateTransitioner) {
    STATE_TRANSITIONER = _stateTransitioner;
  }

  /*
   * @notice Inserts the root of a merkle tree containing all of the L2 to L1 messages in
   * a block specified by _l2BlockNumber.
   * @dev Only callable by the state transitioner (rollup contract)
   * @dev Emits `RootAdded` upon inserting the root successfully
   * @param _l2BlockNumber - The L2 Block Number in which the L2 to L1 messages reside
   * @param _root - The merkle root of the tree where all the L2 to L1 messages are leaves
   * @param _height - The height of the merkle tree that the root corresponds to
   */
  function insert(uint256 _l2BlockNumber, bytes32 _root, uint256 _height)
    external
    override(INewOutbox)
  {
    if (msg.sender != STATE_TRANSITIONER) {
      revert Errors.Outbox__Unauthorized();
    }

    if (roots[_l2BlockNumber].root != bytes32(0)) {
      revert Errors.Outbox__RootAlreadySetAtBlock(_l2BlockNumber);
    }

    if (_root == bytes32(0)) {
      revert Errors.Outbox__InsertingInvalidRoot();
    }

    roots[_l2BlockNumber].root = _root;
    roots[_l2BlockNumber].height = _height;

    emit RootAdded(_l2BlockNumber, _root, _height);
  }

  /*
   * @notice Consumes an entry from the Outbox
   * @dev Only useable by portals / recipients of messages
   * @dev Emits `MessageConsumed` when consuming messages
   * @param _l2BlockNumber - The block number specifying the block that contains the message we want to consume
   * @param _leafIndex - The index inside the merkle tree where the message is located
   * @param _message - The L2 to L1 message
   * @param _path - The sibling path used to prove inclusion of the message, the _path length directly depends
   * on the total amount of L2 to L1 messages in the block. i.e. the length of _path is equal to the depth of the
   * L1 to L2 message tree.
   */
  function consume(
    uint256 _l2BlockNumber,
    uint256 _leafIndex,
    DataStructures.L2ToL1Msg memory _message,
    bytes32[] memory _path
  ) external override(INewOutbox) {
    if (msg.sender != _message.recipient.actor) {
      revert Errors.Outbox__InvalidRecipient(_message.recipient.actor, msg.sender);
    }

    if (block.chainid != _message.recipient.chainId) {
      revert Errors.Outbox__InvalidChainId();
    }

    bytes32 expectedRoot = roots[_l2BlockNumber].root;

    if (expectedRoot == 0) {
      revert Errors.Outbox__NothingToConsumeAtBlock(_l2BlockNumber);
    }

    if (roots[_l2BlockNumber].nullified[_leafIndex]) {
      revert Errors.Outbox__AlreadyNullified(_l2BlockNumber, _leafIndex);
    }

    uint256 expectedHeight = roots[_l2BlockNumber].height;

    if (expectedHeight != _path.length) {
      revert Errors.Outbox__InvalidPathLength(expectedHeight, _path.length);
    }

    bytes32 messageHash = _message.sha256ToField();

    Merkle._verifyMembership(_path, messageHash, _leafIndex, expectedRoot);

    roots[_l2BlockNumber].nullified[_leafIndex] = true;

    emit MessageConsumed(_l2BlockNumber, expectedRoot, messageHash, _leafIndex);
  }

  /*
   * @notice Verifies the membership of an L2 to L1 message against an expected root.
   * @dev This function assumes a valid path height, as well as sane inputs.
   * @dev In the case of a mismatched root, and subsequent inability to verify membership, this function throws.
   * @param _path - The sibling path of the message as a leaf, used to prove message inclusion
   * @param _leaf - The hash of the message we are trying to prove inclusion for
   * @param _index - The index of the message inside the L2 to L1 message tree
   * @param _expectedRoot - The expected root to check the validity of the message and sibling path with.
   */
  function _verifyMembership(
    bytes32[] memory _path,
    bytes32 _leaf,
    uint256 _index,
    bytes32 _expectedRoot
  ) internal pure {
    bytes32 subtreeRoot = _leaf;
    uint256 indexAtHeight = _index;

    for (uint256 height = 0; height < _path.length; height++) {
      bool isRight = (indexAtHeight & 1) == 1;

      subtreeRoot = isRight
        ? sha256(bytes.concat(_path[height], subtreeRoot))
        : sha256(bytes.concat(subtreeRoot, _path[height]));

      indexAtHeight /= 2;
    }

    if (subtreeRoot != _expectedRoot) {
      revert Errors.MerkleLib__InvalidRoot(_expectedRoot, subtreeRoot);
    }
  }
}
