// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {MessageBox} from "./MessageBox.sol";

/**
 * @title Inbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to pass messages into the rollup, e.g., L1 -> L2 messages.
 */
contract Inbox is MessageBox {
  error Inbox__NotPastDeadline();
  error Inbox__PastDeadline();
  error Inbox__Unauthorized();

  /**
   * @dev  struct for sending messages from L1 to L2
   * @param sender - The sender of the message
   * @param recipient - The recipient of the message
   * @param content - The content of the message (application specific) padded to bytes32 or hashed if larger.
   * @param secretHash - The secret hash of the message (make it possible to hide when a specific message is consumed on L2)
   * @param deadline - The deadline to consume a message. Only after it, can a message be cancalled.
   * @param fee - The fee provided to sequencer for including the entry
   */
  struct L1ToL2Msg {
    L1Actor sender;
    L2Actor recipient;
    bytes32 content;
    bytes32 secretHash;
    uint256 deadline;
    uint256 fee;
  }

  event MessageAdded(
    bytes32 indexed entryKey,
    address indexed sender,
    bytes32 indexed recipient,
    uint256 senderChainId,
    uint256 recipientVersion,
    uint256 deadline,
    uint256 fee,
    bytes32 content
  );

  mapping(address account => uint256 balance) public feesAccrued;

  /// @notice Given a message, computes an entry key for the Inbox
  function computeMessageKey(L1ToL2Msg memory message) public pure returns (bytes32) {
    return keccak256(
      abi.encode(
        message.sender,
        message.recipient,
        message.content,
        message.secretHash,
        message.deadline,
        message.fee
      )
    );
  }

  /**
   * @notice Inserts an entry into the Inbox
   * @dev Will emit `MessageAdded` with data for easy access by the sequencer
   * @dev msg.value - The fee provided to sequencer for including the entry
   * @param _recipient - The recipient of the entry
   * @param _deadline - The deadline to consume a message. Only after it, can a message be cancalled.
   * @param _content - The content of the entry (application specific)
   * @param _secretHash - The secret hash of the entry (make it possible to hide when a specific entry is consumed on L2)
   * @return The key of the entry in the set
   */
  function sendL2Message(
    L2Actor memory _recipient,
    uint256 _deadline,
    bytes32 _content,
    bytes32 _secretHash
  ) external payable returns (bytes32) {
    L1ToL2Msg memory message = L1ToL2Msg({
      sender: L1Actor(msg.sender, block.chainid),
      recipient: _recipient,
      content: _content,
      secretHash: _secretHash,
      deadline: _deadline,
      fee: msg.value
    });

    bytes32 key = computeMessageKey(message);
    _insert(key);

    emit MessageAdded(
      key,
      message.sender.actor,
      message.recipient.actor,
      message.sender.chainId,
      message.recipient.version,
      message.deadline,
      message.fee,
      message.content
    );

    return key;
  }

  /**
   * @notice Cancel a pending L2 message
   * @dev Will revert if the deadline have not been crossed - message only cancellable past the deadline
   *  so it cannot be yanked away while the sequencer is building a block including it
   * @dev Must be called by portal that inserted the entry
   * @param _message - The content of the entry (application specific)
   * @param _feeCollector - The address to receive the "fee"
   * @return The key of the entry removed
   */
  function cancelL2Message(L1ToL2Msg memory _message, address _feeCollector)
    external
    returns (bytes32)
  {
    if (msg.sender != _message.sender.actor) revert Inbox__Unauthorized();
    if (_message.deadline <= block.timestamp) revert Inbox__NotPastDeadline();
    return _consumeInboxMessage(_message, _feeCollector);
  }

  /**
   * @notice Consumes an entry from the Inbox
   * @dev Only callable by the rollup contract
   * @dev Will revert if the message is already past deadline
   * @param _message - The content of the entry (application specific)
   * @param _feeCollector - The address to receive the "fee"
   * @return The key of the entry removed
   */
  function consume(L1ToL2Msg memory _message, address _feeCollector)
    external
    onlyRollup
    returns (bytes32)
  {
    if (_message.deadline > block.timestamp) revert Inbox__PastDeadline();

    return _consumeInboxMessage(_message, _feeCollector);
  }

  function _consumeInboxMessage(L1ToL2Msg memory _message, address _feeCollector)
    internal
    returns (bytes32 entryKey)
  {
    entryKey = computeMessageKey(_message);
    _consume(entryKey);
    feesAccrued[_feeCollector] += _message.fee;
  }
}
