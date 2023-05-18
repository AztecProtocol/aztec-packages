// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {DataStructures} from "../../libraries/DataStructures.sol";
import {IMessageBox} from "@aztec/core/interfaces/messagebridge/IMessageBox.sol";

/**
 * @title IOutbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the rollup contract
 * and will be consumed by the portal contracts.
 */
interface IOutbox is IMessageBox {
  // to make it easier for portal to know when to consume the message.
  event MessageAdded(bytes32 indexed entryKey);

  event MessageConsumed(bytes32 indexed entryKey, address indexed recipient);

  /**
   * @notice Computes an entry key for the Outbox
   * @param _message - The L2 to L1 message
   * @return The key of the entry in the set
   */
  function computeEntryKey(DataStructures.L2ToL1Msg memory _message) external returns (bytes32);

  /**
   * @notice Inserts an array of entries into the Outbox
   * @dev Only callable by the rollup contract
   * @param _entryKey - Array of entry keys (hash of the message) - computed by the L2 counterpart and sent to L1 via rollup block
   */
  function sendL1Messages(bytes32[] memory _entryKey) external;

  /**
   * @notice Consumes an entry from the Outbox
   * @dev Only meaningfully callable by portals, otherwise should never hit an entry
   * @dev Emits the `MessageConsumed` event when consuming messages
   * @param _message - The L2 to L1 message
   * @return entryKey - The key of the entry removed
   */
  function consume(DataStructures.L2ToL1Msg memory _message) external returns (bytes32 entryKey);
}
