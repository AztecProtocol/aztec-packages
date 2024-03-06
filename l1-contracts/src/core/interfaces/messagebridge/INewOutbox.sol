// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.18;

import {DataStructures} from "../../libraries/DataStructures.sol";

/**
 * @title INewOutbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the rollup contract
 * and will be consumed by the portal contracts.
 */
// TODO: rename to IOutbox once all the pieces of the new message model are in place.
interface INewOutbox {
  event RootAdded(uint256 indexed l2BlockNumber, bytes32 indexed root, uint256 height);
  event MessageConsumed(
    uint256 indexed l2BlockNumber, bytes32 indexed root, bytes32 indexed messageHash
  );

  /*
   * @notice Inserts the root of a merkle tree containing all of the L2 to L1 messages in
   * a block specified by _blockNumber.
   * @dev Only callable by the rollup contract (state transitioner)
   * @dev Emits the `RootAdded` upon inserting the root successfully
   * @param _l2BlockNumber - The L2 Block Number in which the L2 to L1 message reside
   * @param _root - The merkle root of the tree where all the L2 to L1 messages are leaves
   * @param _height - The height of the merkle tree that the root corresponds to
   */
  function insert(uint256 _l2BlockNumber, bytes32 _root, uint256 _height) external;

  /*
   * @notice Consumes an entry from the Outbox
   * @dev Only meaningfully callable by portals / recipients of messages
   * @dev Emits the `MessageConsumed` event when consuming messages
   * @param _l2BlockNumber - The block number specifying the block that contains the message we want to consume
   * @param _leafIndex - The index where the message resides inside the merkle tree
   * @param _message - The L2 to L1 message
   * @param _path - The sibling path used to prove inclusion of the message
   */
  function consume(
    uint256 _l2BlockNumber,
    uint256 _leafIndex,
    DataStructures.L2ToL1Msg memory _message,
    bytes32[] memory _path
  ) external;
}
