// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {IRegistryReader} from "./IRegistryReader.sol";

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

  /// @dev Actor on L1. ChainID if multiple L1s tap into the same Aztec instance.
  struct L1Actor {
    address actor;
    uint256 chainId;
  }

  /// @dev Actor on L2. `version` specifies which Aztec instance the actor is on (useful for upgrades)
  struct L2Actor {
    bytes32 actor;
    uint256 version;
  }

  /**
   * @dev Entry struct - Done as struct to easily support extensions if needed
   * @param count - The occurrence of the entry in the dataset
   * @param fee - The fee provided to sequencer for including in the inbox. 0 if Oubox (as not applicable).
   */
  struct Entry {
    uint64 count;
    uint64 fee;
    uint32 deadline;
  }

  IRegistryReader registry;

  // Prime field order
  uint256 internal constant P =
    21888242871839275222246405745257275088548364400416034343698204186575808495617;

  mapping(bytes32 entryKey => Entry entry) internal entries;

  modifier onlyRollup() {
    if (msg.sender != registry.getL1L2Addresses().rollup) revert MessageBox__Unauthorized();
    _;
  }

  constructor(address _registry) {
    registry = IRegistryReader(_registry);
  }

  /**
   * @notice Inserts an entry into the multi-set
   * @param _entryKey - The key to insert
   * @param _fee - The fee provided to sequencer for including in the inbox. 0 if Oubox (as not applicable).
   * @param _deadline - The deadline to consume a message. Only after it, can a message be cancalled.
   */
  function _insert(bytes32 _entryKey, uint64 _fee, uint32 _deadline) internal {
    entries[_entryKey].count++;
    entries[_entryKey].fee = _fee;
    entries[_entryKey].deadline = _deadline;
  }

  /**
   * @notice Inserts an entry into the multi-set with default values for fee and deadline (0 each)
   * @param _entryKey - The key to insert
   */
  function _insertWithDefaultValues(bytes32 _entryKey) internal {
    _insert(_entryKey, 0, 0);
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
