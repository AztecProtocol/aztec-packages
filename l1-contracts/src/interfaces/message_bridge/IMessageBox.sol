// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

/**
 * @title IMessageBox
 * @author Aztec Labs
 * @notice Data structure used in both Inbox and Outbox for keeping track of entries
 * Implements a multi-set storing the multiplicity (count for easy reading) at the entry.
 */
interface IMessageBox {
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

  /**
   * @notice Fetch an entry
   * @param _entryKey - The key to lookup
   * @return The entry matching the provided key
   */
  function get(bytes32 _entryKey) external view returns (Entry memory); 

  /**
   * @notice Check if entry exists
   * @param _entryKey - The key to lookup
   * @return True if entry exists, false otherwise
   */
  function contains(bytes32 _entryKey) external view returns (bool); 
}
