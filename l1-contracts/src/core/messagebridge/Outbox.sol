// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {MessageBox} from "./MessageBox.sol";

/**
 * @title Outbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the rollup contract
 * and will be consumed by the portal contracts.
 */
contract Outbox is MessageBox {
  error Outbox__Unauthorized();
  error Outbox__WrongChainId();

  /**
   * @dev  struct for sending messages from L2 to L1
   * @param sender - The sender of the message
   * @param recipient - The recipient of the message
   * @param content - The content of the message (application specific) padded to bytes32 or hashed if larger.
   */
  struct L2ToL1Msg {
    L2Actor sender;
    L1Actor recipient;
    bytes32 content;
  }

  // to make it easier for portal to know when to consume the message.
  event MessageAdded(bytes32 indexed entryKey);

  event MessageConsumed(bytes32 indexed entryKey, address indexed recipient);

  constructor(address _registry) MessageBox(_registry) {}

  /**
   * @notice Computes an entry key for the Outbox
   * @param _message - The L2 to L1 message
   * @return The key of the entry in the set
   */
  function computeEntryKey(L2ToL1Msg memory _message) public pure returns (bytes32) {
    // FIXME: Replace mod P later on when we have a better idea of how to handle Fields.
    return bytes32(
      uint256(sha256(abi.encode(_message.sender, _message.recipient, _message.content))) % P
    );
  }

  /**
   * @notice Inserts an array of entries into the Outbox
   * @dev Only callable by the rollup contract
   * @param _entryKey - Array of entry keys (hash of the message) - computed by the L2 counterpart and sent to L1 via rollup block
   */
  function sendL1Messages(bytes32[] memory _entryKey) external onlyRollup {
    for (uint256 i = 0; i < _entryKey.length; i++) {
      _insertWithDefaultValues(_entryKey[i]);
      emit MessageAdded(_entryKey[i]);
    }
  }

  /**
   * @notice Consumes an entry from the Outbox
   * @dev Only meaningfully callable by portals, otherwise should never hit an entry
   * @dev Emits the `MessageConsumed` event when consuming messages
   * @param _message - The L2 to L1 message
   * @return entryKey - The key of the entry removed
   */
  function consume(L2ToL1Msg memory _message) external returns (bytes32 entryKey) {
    if (msg.sender != _message.recipient.actor) revert Outbox__Unauthorized();
    if (block.chainid != _message.recipient.chainId) revert Outbox__WrongChainId();

    entryKey = computeEntryKey(_message);
    _consume(entryKey);
    emit MessageConsumed(entryKey, _message.recipient.actor);
  }
}
