// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {DataStructures} from "./DataStructures.sol";

/**
 * @title MessageBox
 * @author Aztec
 * @notice Implements a multiset of entries (DataStructures.Entry)
 */
library MessageBox {
  error NothingToConsume(bytes32 entryKey);
  error IncompatibleEntryArguments(
    bytes32 entryKey,
    uint64 storedFee,
    uint64 feePassed,
    uint32 storedDeadline,
    uint32 deadlinePassed
  );

  function insert(
    mapping(bytes32 entryKey => DataStructures.Entry entry) storage self,
    bytes32 _entryKey,
    uint64 _fee,
    uint32 _deadline
  ) internal {
    DataStructures.Entry memory entry = self[_entryKey];
    if (
      (entry.fee != 0 && entry.fee != _fee) || (entry.deadline != 0 && entry.deadline != _deadline)
    ) {
      // this should never happen as it is trying to overwrite `fee` and `deadline` with different values
      // even though the entryKey (a hash) is the same! Pass all arguments to the error message for debugging.
      revert IncompatibleEntryArguments(_entryKey, entry.fee, _fee, entry.deadline, _deadline);
    }
    entry.count += 1;
    entry.fee = _fee;
    entry.deadline = _deadline;
    self[_entryKey] = entry;
  }

  function contains(
    mapping(bytes32 entryKey => DataStructures.Entry entry) storage self,
    bytes32 _entryKey
  ) internal view returns (bool) {
    return self[_entryKey].count > 0;
  }
  /**
   * @notice Fetch an entry
   * @param _entryKey - The key to lookup
   * @return The entry matching the provided key
   */

  function get(
    mapping(bytes32 entryKey => DataStructures.Entry entry) storage self,
    bytes32 _entryKey
  ) internal view returns (DataStructures.Entry memory) {
    DataStructures.Entry memory entry = self[_entryKey];
    if (entry.count == 0) revert NothingToConsume(_entryKey);
    return entry;
  }

  /**
   * @notice Consumed an entry if possible, reverts if nothing to consume
   * For multiplicity > 1, will consume one element
   * @param _entryKey - The key to consume
   */
  function consume(
    mapping(bytes32 entryKey => DataStructures.Entry entry) storage self,
    bytes32 _entryKey
  ) internal {
    DataStructures.Entry storage entry = self[_entryKey];
    if (entry.count == 0) revert NothingToConsume(_entryKey);
    entry.count--;
  }
}
