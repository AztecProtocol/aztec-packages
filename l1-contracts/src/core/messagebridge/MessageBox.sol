// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

/**
 * @title MessageBox
 * @author Aztec Labs
 * @notice Data structure used in both Inbox and Outbox for keeping track of entries
 * Implements a multi-set storing the multiplicity (count for easy reading) at the entry.
 */
abstract contract MessageBox {
  error MessageBox__Unauthorized();
  error MessageBox__NothingToConsume(bytes32 entryKey);
  error MessageBox__OversizedContent();

  uint256 public constant MESSAGE_SIZE = 32;

  /// @dev Message sender on L1. ChainID if multiple L1s tap into the same Aztec instance.
  struct L1Actor {
    address actor;
    uint256 chainId;
  }

  /// @dev Message receiver on L2.
  struct L2Actor {
    bytes32 actor;
    uint256 version;
  }

  /**
   * @dev Entry struct - Done as struct to easily support extensions if needed
   * @param count - The occurrence of the entry in the dataset
   */
  struct Entry {
    uint256 count;
  }

  address rollup;

  mapping(bytes32 entryKey => Entry entry) internal entries;

  event RollupUpdated(address indexed newRollup, address indexed oldRollup);

  modifier onlyRollup() {
    if (msg.sender != rollup) revert MessageBox__Unauthorized();
    _;
  }

  constructor() {
    rollup = msg.sender;
  }

  function updateRollup(address _newRollup) external onlyRollup {
    emit RollupUpdated(_newRollup, rollup);
    rollup = _newRollup;
  }

  /**
   * @notice Inserts an entry into the multi-set
   * @param _entryKey - The key to insert
   */
  function _insert(bytes32 _entryKey) internal {
    entries[_entryKey].count++;
  }

  /**
   * @notice Consumed an entry if possible, reverts if nothing to consume
   * For multiplicity > 1, will consume one element
   * @param _entryKey - The key to consume
   */
  function _consume(bytes32 _entryKey) internal {
    Entry storage entry = entries[_entryKey];
    if (entry.count == 0) revert MessageBox__NothingToConsume(_entryKey);
    entry.count--;
  }

  /**
   * @notice Fetch an entry
   * @param _entryKey - The key to lookup
   * @return The entry matching the provided key
   */
  function get(bytes32 _entryKey) public view returns (Entry memory) {
    Entry memory entry = entries[_entryKey];
    if (entry.count == 0) revert MessageBox__NothingToConsume(_entryKey);
    return entry;
  }

  /**
   * @notice Check if entry exists
   * @param _entryKey - The key to lookup
   * @return True if entry exists, false otherwise
   */
  function contains(bytes32 _entryKey) public view returns (bool) {
    return entries[_entryKey].count > 0;
  }
}
