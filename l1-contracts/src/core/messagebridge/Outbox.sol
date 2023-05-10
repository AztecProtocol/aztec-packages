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
  event MessageAdded(
    bytes32 indexed entryKey,
    bytes32 indexed sender,
    address indexed recipient,
    uint256 senderVersion,
    uint256 recipientChainId,
    bytes32 content
  );

  event MessageConsumed(bytes32 indexed entryKey, address indexed recipient);

  /**
   * @notice Computes an entry key for the Outbox
   * @param _message - The L2 to L1 message
   * @return The key of the entry in the set
   */
  function computeEntryKey(L2ToL1Msg memory _message) public pure returns (bytes32) {
    return keccak256(abi.encode(_message.sender, _message.recipient, _message.content));
  }

  /**
   * @notice Inserts an entry into the Outbox
   * @dev Only callable by the rollup contract
   * @param _sender - The L2 sender of the message
   * @param _recipient - The L1 recipient of the message
   * @param _content - The content of the entry (application specific)
   * @return The key of the entry in the set
   */
  function sendL1Message(L2Actor memory _sender, L1Actor memory _recipient, bytes32 _content)
    external
    onlyRollup
    returns (bytes32)
  {
    if (block.chainid != _recipient.chainId) revert Outbox__WrongChainId();
    // TODO: Since the rollup contract does it, there isn't anything currently to prevent
    // the sequencer from adding random messages from random L2 address. Add signature verification
    L2ToL1Msg memory message = L2ToL1Msg(_sender, _recipient, _content);
    bytes32 entryKey = computeEntryKey(message);
    _insert(entryKey);
    emit MessageAdded(
      entryKey, _sender.actor, _recipient.actor, _sender.version, _recipient.chainId, _content
    );
    return entryKey;
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
