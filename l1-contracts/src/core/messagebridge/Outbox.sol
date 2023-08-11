// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

// Interfaces
import {IOutbox} from "@aztec/core/interfaces/messagebridge/IOutbox.sol";
import {IRegistry} from "@aztec/core/interfaces/messagebridge/IRegistry.sol";

// Libraries
import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Hash} from "@aztec/core/libraries/Hash.sol";
import {MessageBox} from "@aztec/core/libraries/MessageBox.sol";

/**
 * @title Outbox
 * @author Aztec Labs
 * @notice Lives on L1 and is used to consume L2 -> L1 messages. Messages are inserted by the rollup contract
 * and will be consumed by the portal contracts.
 */
contract Outbox is IOutbox {
  using MessageBox for mapping(bytes32 entryKey => DataStructures.Entry entry);
  using Hash for DataStructures.L2ToL1Msg;

  IRegistry public immutable REGISTRY;

  mapping(bytes32 entryKey => DataStructures.Entry entry) internal entries;

  constructor(address _registry) {
    REGISTRY = IRegistry(_registry);
  }

  /**
   * @notice Inserts an array of entries into the Outbox
   * @dev Only callable by the rollup contract
   * @param _entryKeys - Array of entry keys (hash of the message) - computed by the L2 counterpart and sent to L1 via rollup block
   */
  function sendL1Messages(bytes32[] memory _entryKeys) external override(IOutbox) {
    // This MUST revert if not called by a listed rollup contract
    uint32 version = uint32(REGISTRY.getVersionFor(msg.sender));
    for (uint256 i = 0; i < _entryKeys.length; i++) {
      if (_entryKeys[i] == bytes32(0)) continue;
      entries.insert(_entryKeys[i], 0, version, 0, _errIncompatibleEntryArguments);
      emit MessageAdded(_entryKeys[i]);
    }
  }

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
  ) external override(IOutbox) returns (bytes32 entryKey) {
    if (msg.sender != _recipientAddress) revert Errors.Outbox__Unauthorized();
    if (block.chainid != _recipientChainId) revert Errors.Outbox__InvalidChainId();

    DataStructures.L2ToL1Msg memory message = DataStructures.L2ToL1Msg({
      sender: DataStructures.L2Actor({actor: _senderAddress, version: _senderVersion}),
      recipient: DataStructures.L1Actor({actor: _recipientAddress, chainId: _recipientChainId}),
      content: _content
    });

    entryKey = _computeEntryKey(message);
    DataStructures.Entry memory entry = entries.get(entryKey, _errNothingToConsume);
    if (entry.version != _senderVersion) {
      revert Errors.Outbox__InvalidVersion(entry.version, _senderVersion);
    }

    entries.consume(entryKey, _errNothingToConsume);
    emit MessageConsumed(entryKey, msg.sender);
  }

  /**
   * @notice Fetch an entry
   * @param _entryKey - The key to lookup
   * @return The entry matching the provided key
   */
  function get(bytes32 _entryKey)
    public
    view
    override(IOutbox)
    returns (DataStructures.Entry memory)
  {
    return entries.get(_entryKey, _errNothingToConsume);
  }

  /**
   * @notice Check if entry exists
   * @param _entryKey - The key to lookup
   * @return True if entry exists, false otherwise
   */
  function contains(bytes32 _entryKey) public view override(IOutbox) returns (bool) {
    return entries.contains(_entryKey);
  }

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
  ) public pure override(IOutbox) returns (bytes32) {
    return _computeEntryKey(
      DataStructures.L2ToL1Msg({
        sender: DataStructures.L2Actor({actor: _senderAddress, version: _senderVersion}),
        recipient: DataStructures.L1Actor({actor: _recipientAddress, chainId: _recipientChainId}),
        content: _content
      })
    );
  }

  /**
   * @notice Computes an entry key for the Outbox
   * @param _message - The L2 to L1 message
   * @return The key of the entry in the set
   */
  function _computeEntryKey(DataStructures.L2ToL1Msg memory _message)
    internal
    pure
    returns (bytes32)
  {
    return _message.sha256ToField();
  }

  /**
   * @notice Error function passed in cases where there might be nothing to consume
   * @dev Used to have message box library throw `Outbox__` prefixed errors
   * @param _entryKey - The key to lookup
   */
  function _errNothingToConsume(bytes32 _entryKey) internal pure {
    revert Errors.Outbox__NothingToConsume(_entryKey);
  }

  /**
   * @notice Error function passed in cases where insertions can fail
   * @dev Used to have message box library throw `Outbox__` prefixed errors
   * @param _entryKey - The key to lookup
   * @param _storedFee - The fee stored in the entry
   * @param _feePassed - The fee passed into the insertion
   * @param _storedVersion - The version stored in the entry
   * @param _versionPassed - The version passed into the insertion
   * @param _storedDeadline - The deadline stored in the entry
   * @param _deadlinePassed - The deadline passed into the insertion
   */
  function _errIncompatibleEntryArguments(
    bytes32 _entryKey,
    uint64 _storedFee,
    uint64 _feePassed,
    uint32 _storedVersion,
    uint32 _versionPassed,
    uint32 _storedDeadline,
    uint32 _deadlinePassed
  ) internal pure {
    revert Errors.Outbox__IncompatibleEntryArguments(
      _entryKey,
      _storedFee,
      _feePassed,
      _storedVersion,
      _versionPassed,
      _storedDeadline,
      _deadlinePassed
    );
  }
}
