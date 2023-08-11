// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {DataStructures} from "../../libraries/DataStructures.sol";

/**
 * @title IOutbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the rollup contract
 * and will be consumed by the portal contracts.
 */
interface IOutbox {
  // to make it easier for portal to know when to consume the message.
  event MessageAdded(bytes32 indexed entryKey);

  event MessageConsumed(bytes32 indexed entryKey, address indexed recipient);

  /**
   * @notice Computes an entry key for the Outbox
   * @param _senderAddress - The address of the sender
   * @param _senderVersion - The version of the sender
   * @param _recipientAddress - The address of the recipient
   * @param _recipientChainId - The version of the recipient
   * @param _content - The content of the entry (application specific)
   * @return The key of the entry in the set
   */
  function computeEntryKey(
    bytes32 _senderAddress,
    uint256 _senderVersion,
    address _recipientAddress,
    uint256 _recipientChainId,
    bytes32 _content
  ) external returns (bytes32);

  /**
   * @notice Inserts an array of entries into the Outbox
   * @dev Only callable by the rollup contract
   * @param _entryKeys - Array of entry keys (hash of the message) - computed by the L2 counterpart and sent to L1 via rollup block
   */
  function sendL1Messages(bytes32[] memory _entryKeys) external;

  /**
   * @notice Consumes an entry from the Outbox
   * @dev Only meaningfully callable by portals, otherwise should never hit an entry
   * @dev Emits the `MessageConsumed` event when consuming messages
   * @param _senderAddress - The address of the sender
   * @param _senderVersion - The version of the sender
   * @param _recipientAddress - The address of the recipient
   * @param _recipientChainId - The version of the recipient
   * @param _content - The content of the entry (application specific)
   * @return entryKey - The key of the entry removed
   */
  function consume(
    bytes32 _senderAddress,
    uint256 _senderVersion,
    address _recipientAddress,
    uint256 _recipientChainId,
    bytes32 _content
  ) external returns (bytes32 entryKey);

  /**
   * @notice Fetch an entry
   * @param _entryKey - The key to lookup
   * @return The entry matching the provided key
   */
  function get(bytes32 _entryKey) external view returns (DataStructures.Entry memory);

  /**
   * @notice Check if entry exists
   * @param _entryKey - The key to lookup
   * @return True if entry exists, false otherwise
   */
  function contains(bytes32 _entryKey) external view returns (bool);
}
