// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

// Libraries
import {DataStructures} from "../libraries/DataStructures.sol";
import {Errors} from "../libraries/Errors.sol";
import {Constants} from "../libraries/ConstantsGen.sol";
import {MerkleLib} from "../libraries/MerkleLib.sol";
import {Hash} from "../libraries/Hash.sol";
import {IOutbox} from "../interfaces/messagebridge/IOutbox.sol";

/**
 * @title Outbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the Rollup
 * and will be consumed by the portal contracts.
 */
contract Outbox is IOutbox {
  using Hash for DataStructures.L2ToL1Msg;

  struct RootData {
    // This is the outhash specified by header.globalvariables.outHash of any given block.
    bytes32 root;
    uint256 minHeight;
    mapping(uint256 => bool) nullified;
  }

  address public immutable ROLLUP_CONTRACT;
  mapping(uint256 l2BlockNumber => RootData) public roots;

  constructor(address _rollup) {
    ROLLUP_CONTRACT = _rollup;
  }

  /**
   * @notice Inserts the root of a merkle tree containing all of the L2 to L1 messages in
   * a block specified by _l2BlockNumber.
   * @dev Only callable by the rollup contract
   * @dev Emits `RootAdded` upon inserting the root successfully
   * @param _l2BlockNumber - The L2 Block Number in which the L2 to L1 messages reside
   * @param _root - The merkle root of the tree where all the L2 to L1 messages are leaves
   * @param _minHeight - The min height of the merkle tree that the root corresponds to
   */
  function insert(uint256 _l2BlockNumber, bytes32 _root, uint256 _minHeight)
    external
    override(IOutbox)
  {
    if (msg.sender != ROLLUP_CONTRACT) {
      revert Errors.Outbox__Unauthorized();
    }

    if (roots[_l2BlockNumber].root != bytes32(0)) {
      revert Errors.Outbox__RootAlreadySetAtBlock(_l2BlockNumber);
    }

    if (_root == bytes32(0)) {
      revert Errors.Outbox__InsertingInvalidRoot();
    }

    roots[_l2BlockNumber].root = _root;
    roots[_l2BlockNumber].minHeight = _minHeight;

    emit RootAdded(_l2BlockNumber, _root, _minHeight);
  }

  /**
   * @notice Consumes an entry from the Outbox
   * @dev Only useable by portals / recipients of messages
   * @dev Emits `MessageConsumed` when consuming messages
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
    if (msg.sender != _message.recipient.actor) {
      revert Errors.Outbox__InvalidRecipient(_message.recipient.actor, msg.sender);
    }

    if (block.chainid != _message.recipient.chainId) {
      revert Errors.Outbox__InvalidChainId();
    }

    RootData storage rootData = roots[_l2BlockNumber];

    bytes32 blockRoot = rootData.root;

    if (blockRoot == 0) {
      revert Errors.Outbox__NothingToConsumeAtBlock(_l2BlockNumber);
    }

    if (rootData.nullified[_leafIndex]) {
      revert Errors.Outbox__AlreadyNullified(_l2BlockNumber, _leafIndex);
    }

    // Min height = height of rollup layers
    // The smallest num of messages will require a subtree of height 1
    uint256 treeHeight = rootData.minHeight;
    if (treeHeight > _path.length) {
      revert Errors.Outbox__InvalidPathLength(treeHeight, _path.length);
    }

    // Max height = height of rollup layers + max possible subtree height
    // The max num of messages N will require a subtree of height log2(N)
    uint256 maxSubtreeHeight = calculateTreeHeightFromSize(Constants.MAX_NEW_L2_TO_L1_MSGS_PER_TX);
    if (treeHeight + maxSubtreeHeight < _path.length) {
      revert Errors.Outbox__InvalidPathLength(treeHeight + maxSubtreeHeight, _path.length);
    }

    bytes32 messageHash = _message.sha256ToField();

    MerkleLib.verifyMembership(_path, messageHash, _leafIndex, blockRoot);

    rootData.nullified[_leafIndex] = true;

    emit MessageConsumed(_l2BlockNumber, blockRoot, messageHash, _leafIndex);
  }

  /**
   * @notice Checks to see if an index of the L2 to L1 message tree for a specific block has been consumed
   * @dev - This function does not throw. Out-of-bounds access is considered valid, but will always return false
   * @param _l2BlockNumber - The block number specifying the block that contains the index of the message we want to check
   * @param _leafIndex - The index of the message inside the merkle tree
   */
  function hasMessageBeenConsumedAtBlockAndIndex(uint256 _l2BlockNumber, uint256 _leafIndex)
    external
    view
    override(IOutbox)
    returns (bool)
  {
    return roots[_l2BlockNumber].nullified[_leafIndex];
  }

  /**
   * @notice Calculates a tree height from the amount of elements in the tree
   * @dev - This mirrors the function in TestUtil, but assumes _size is an exact power of 2
   * @param _size - The number of elements in the tree
   */
  function calculateTreeHeightFromSize(uint256 _size) internal pure returns (uint256) {
    /// We need the height of the tree that will contain all of our leaves,
    /// hence the next highest power of two from the amount of leaves - Math.ceil(Math.log2(x))
    uint256 height = 0;

    /// While size > 1, we divide by two, and count how many times we do this; producing a rudimentary way of calculating Math.Floor(Math.log2(x))
    while (_size > 1) {
      _size >>= 1;
      height++;
    }
    return height;
  }
}
