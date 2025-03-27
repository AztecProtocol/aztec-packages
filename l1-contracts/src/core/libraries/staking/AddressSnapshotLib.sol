// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";

/**
 * @notice Structure to store a set of addresses with their historical snapshots
 * @param size The current number of addresses in the set
 * @param checkpoints Mapping of index to array of address snapshots
 * @param validatorToIndex Mapping of validator address to its current index in the set
 */
struct SnapshottedAddressSet {
  uint256 size;
  mapping(uint256 index => AddressSnapshot[]) checkpoints;
  // Store up to date position for each validator
  mapping(address validator => uint256 index) validatorToIndex;
}

/**
 * @notice Structure to store a single address snapshot
 * @param addr The address being snapshotted
 * @param epochNumber The epoch number when this snapshot was taken
 */
struct AddressSnapshot {
  address addr;
  uint96 epochNumber;
}

/**
 * @title AddressSnapshotLib
 * @notice A library for managing a set of addresses with historical snapshots
 * @dev This library provides functionality similar to EnumerableSet but can track addresses across different epochs
 *      and allows querying the state of addresses at any point in time
 */
library AddressSnapshotLib {
  /**
   * @notice Bit mask used to indicate presence of a validator in the set
   */
  uint256 internal constant PRESENCE_BIT = 1 << 255;

  /**
   * @notice Adds a validator to the set
   * @param _self The storage reference to the set
   * @param _validator The address of the validator to add
   * @return bool True if the validator was added, false if it was already present
   */
  function add(SnapshottedAddressSet storage _self, address _validator) internal returns (bool) {
    // Prevent against double insertion
    if (_self.validatorToIndex[_validator] != 0) {
      return false;
    }

    // Insert into the end of the array
    uint256 index = _self.size;
    Epoch _epochNumber = TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp));

    // Include max bit to indicate that the validator is in the set - means 0 index is not 0
    uint256 indexWithBit = index | PRESENCE_BIT;

    _self.validatorToIndex[_validator] = indexWithBit;
    _self.checkpoints[index].push(
      AddressSnapshot({addr: _validator, epochNumber: uint96(Epoch.unwrap(_epochNumber))})
    );
    _self.size += 1;
    return true;
  }

  /**
   * @notice Removes a validator from the set by index
   * @param _self The storage reference to the set
   * @param _index The index of the validator to remove
   * @return bool True if the validator was removed, false otherwise
   */
  function remove(SnapshottedAddressSet storage _self, uint256 _index) internal returns (bool) {
    // To remove from the list, we push the last item into the index and reduce the size
    uint256 lastIndex = _self.size - 1;
    uint256 lastSnapshotLength = _self.checkpoints[lastIndex].length;

    uint256 epochNow = Epoch.unwrap(TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp)));

    AddressSnapshot memory lastSnapshot = _self.checkpoints[lastIndex][lastSnapshotLength - 1];

    address lastValidator = lastSnapshot.addr;
    uint256 newLocationWithMask = _index | PRESENCE_BIT;

    _self.validatorToIndex[lastValidator] = newLocationWithMask; // Remove the last validator from the index

    // If we are removing the last item, we cannot swap it with anything
    // so we append a new address of zero for this epoch
    if (lastIndex == _index) {
      lastSnapshot.addr = address(0);

      // TODO: reuse value above, only insert once
      _self.validatorToIndex[lastValidator] = 0;
    }

    lastSnapshot.epochNumber = uint96(epochNow);
    // Check if there's already a checkpoint for this index in the current epoch
    uint256 checkpointCount = _self.checkpoints[_index].length;
    if (
      checkpointCount > 0 && _self.checkpoints[_index][checkpointCount - 1].epochNumber == epochNow
    ) {
      // If there's already a checkpoint for this epoch, update it instead of adding a new one
      _self.checkpoints[_index][checkpointCount - 1] = lastSnapshot;
    } else {
      // Otherwise add a new checkpoint
      _self.checkpoints[_index].push(lastSnapshot);
    }

    _self.size -= 1;
    return true;
  }

  /**
   * @notice Removes a validator from the set by address
   * @param _self The storage reference to the set
   * @param _validator The address of the validator to remove
   * @return bool True if the validator was removed, false if it wasn't found
   */
  function remove(SnapshottedAddressSet storage _self, address _validator) internal returns (bool) {
    uint256 index = _self.validatorToIndex[_validator];
    if (index == 0) {
      return false;
    }

    // Remove top most bit
    index = index & ~PRESENCE_BIT;
    return remove(_self, index);
  }

  /**
   * @notice Gets the current address at a specific index
   * @param _self The storage reference to the set
   * @param _index The index to query
   * @return address The current address at the given index
   */
  function at(SnapshottedAddressSet storage _self, uint256 _index) internal view returns (address) {
    uint256 numCheckpoints = _self.checkpoints[_index].length;

    if (_index >= _self.size) {
      revert Errors.AddressSnapshotLib__IndexOutOfBounds(_index, _self.size);
    }

    if (numCheckpoints == 0) {
      return address(0);
    }

    AddressSnapshot memory lastSnapshot = _self.checkpoints[_index][numCheckpoints - 1];
    return lastSnapshot.addr;
  }

  /**
   * @notice Gets the address at a specific index and epoch
   * @param _self The storage reference to the set
   * @param _index The index to query
   * @param _epoch The epoch number to query
   * @return address The address at the given index and epoch
   */
  function getAddressFromIndexAtEpoch(
    SnapshottedAddressSet storage _self,
    uint256 _index,
    Epoch _epoch
  ) internal view returns (address) {
    uint256 numCheckpoints = _self.checkpoints[_index].length;
    uint96 epoch = uint96(Epoch.unwrap(_epoch));

    if (numCheckpoints == 0) {
      return address(0);
    }

    // Check the most recent checkpoint
    AddressSnapshot memory lastSnapshot = _self.checkpoints[_index][numCheckpoints - 1];
    if (lastSnapshot.epochNumber <= epoch) {
      return lastSnapshot.addr;
    }

    // Binary search
    uint256 lower = 0;

    unchecked {
      uint256 upper = numCheckpoints - 1;
      while (upper > lower) {
        uint256 center = upper - (upper - lower) / 2; // ceil, avoiding overflow
        AddressSnapshot memory cp = _self.checkpoints[_index][center];
        if (cp.epochNumber == epoch) {
          return cp.addr;
        } else if (cp.epochNumber < epoch) {
          lower = center;
        } else {
          upper = center - 1;
        }
      }
    }

    return _self.checkpoints[_index][lower].addr;
  }

  /**
   * @notice Gets the current size of the set
   * @param _self The storage reference to the set
   * @return uint256 The number of addresses in the set
   */
  function length(SnapshottedAddressSet storage _self) internal view returns (uint256) {
    return _self.size;
  }

  /**
   * @notice Gets all current addresses in the set
   * @param _self The storage reference to the set
   * @return address[] Array of all current addresses in the set
   */
  function values(SnapshottedAddressSet storage _self) internal view returns (address[] memory) {
    uint256 size = _self.size;
    address[] memory vals = new address[](size);
    for (uint256 i; i < size;) {
      vals[i] = at(_self, i);

      unchecked {
        i++;
      }
    }
    return vals;
  }
}
