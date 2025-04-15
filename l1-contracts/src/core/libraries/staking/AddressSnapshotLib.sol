// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Timestamp, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

/**
 * @notice Structure to store a set of addresses with their historical snapshots
 * @param size The current number of addresses in the set
 * @param checkpoints Mapping of index to array of address snapshots
 * @param validatorToIndex Mapping of validator address to its current index in the set
 */
struct SnapshottedAddressSet {
  // This size must also be snapshotted
  Checkpoints.Trace224 size;
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
  using SafeCast for uint256;
  using Checkpoints for Checkpoints.Trace224;

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
    Epoch _nextEpoch = TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp)) + Epoch.wrap(1);

    uint256 index = _self.size.latest();

    // Include max bit to indicate that the validator is in the set - means 0 index is not 0
    uint256 indexWithBit = index | PRESENCE_BIT;

    _self.validatorToIndex[_validator] = indexWithBit;
    _self.checkpoints[index].push(
      AddressSnapshot({addr: _validator, epochNumber: Epoch.unwrap(_nextEpoch).toUint96()})
    );

    _self.size.push(Epoch.unwrap(_nextEpoch).toUint32(), (index + 1).toUint224());
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
    uint256 lastIndex = _self.size.latest() - 1;
    uint256 lastSnapshotLength = _self.checkpoints[lastIndex].length;

    uint256 nextEpoch = Epoch.unwrap(TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp)) + Epoch.wrap(1));

    AddressSnapshot memory lastSnapshot = _self.checkpoints[lastIndex][lastSnapshotLength - 1];

    address lastValidator = lastSnapshot.addr;
    uint256 newLocation = _index | PRESENCE_BIT;

    // If we are removing the last item, we cannot swap it with anything
    // so we append a new address of zero for this epoch
    // And since we are removing it, we set the location to 0
    if (lastIndex == _index) {
      lastSnapshot.addr = address(0);
      newLocation = 0;
    }

    _self.validatorToIndex[lastValidator] = newLocation;

    lastSnapshot.epochNumber = nextEpoch.toUint96();
    // Check if there's already a checkpoint for this index in the current epoch
    uint256 checkpointCount = _self.checkpoints[_index].length;
    if (
      checkpointCount > 0 && _self.checkpoints[_index][checkpointCount - 1].epochNumber == nextEpoch
    ) {
      // If there's already a checkpoint for this epoch, update it instead of adding a new one
      _self.checkpoints[_index][checkpointCount - 1] = lastSnapshot;
    } else {
      // Otherwise add a new checkpoint
      _self.checkpoints[_index].push(lastSnapshot);
    }

    _self.size.push(nextEpoch.toUint32(), (lastIndex).toUint224());
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
    Epoch currentEpoch = TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp));

    uint256 size = lengthAtEpoch(_self, currentEpoch);

    if (_index >= size) {
      revert Errors.AddressSnapshotLib__IndexOutOfBounds(_index, size);
    }

    if (numCheckpoints == 0) {
      return address(0);
    }

    AddressSnapshot memory lastSnapshot = _self.checkpoints[_index][numCheckpoints - 1];

    // The staking set is frozen in time until the end of the epoch, so we must check if the last checkpoint is in the current epoch
    // If it is, we can return it, otherwise, we must perform a search
    if (lastSnapshot.epochNumber == Epoch.unwrap(currentEpoch)) {
      return lastSnapshot.addr;
    }

    // Otherwise, we must perform a search
    return getAddressFromIndexAtEpoch(_self, _index, currentEpoch);
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
    uint96 epoch = Epoch.unwrap(_epoch).toUint96();

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

    // Guard against the found epoch being greater than the epoch we are querying
    if (epoch < _self.checkpoints[_index][lower].epochNumber) {
      return address(0);
    }

    return _self.checkpoints[_index][lower].addr;
  }

  /**
   * @notice Gets the current size of the set
   * @param _self The storage reference to the set
   * @return uint256 The number of addresses in the set
   */
  function length(SnapshottedAddressSet storage _self) internal view returns (uint256) {
    Epoch currentEpoch = TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp));
    return lengthAtEpoch(_self, currentEpoch);
  }

  // TODO(md): TEST!
  /**
   * @notice Gets the size of the set at a specific epoch
   * @param _self The storage reference to the set
   * @param _epoch The epoch number to query
   * @return uint256 The number of addresses in the set at the given epoch
   */
  function lengthAtEpoch(SnapshottedAddressSet storage _self, Epoch _epoch) internal view returns (uint256) {
    return _self.size.upperLookup(Epoch.unwrap(_epoch).toUint32());
  }

  /**
   * @notice Gets all current addresses in the set
   * @param _self The storage reference to the set
   * @return address[] Array of all current addresses in the set
   */
  function values(SnapshottedAddressSet storage _self) internal view returns (address[] memory) {
    uint256 size = length(_self);
    address[] memory vals = new address[](size);
    for (uint256 i; i < size;) {
      vals[i] = at(_self, i);

      unchecked {
        i++;
      }
    }
    return vals;
  }

  // TODO(md): TEST!
  /**
   * @notice Gets all addresses in the set at a specific epoch
   * @param _self The storage reference to the set
   * @param _epoch The epoch number to query
   * @return address[] Array of all addresses in the set at the given epoch
   */
  function valuesAtEpoch(SnapshottedAddressSet storage _self, Epoch _epoch) internal view returns (address[] memory) {
    uint256 size = lengthAtEpoch(_self, _epoch);
    address[] memory vals = new address[](size);
    for (uint256 i; i < size;) {
      vals[i] = getAddressFromIndexAtEpoch(_self, i, _epoch);

      unchecked {
        i++;
      }
    }
    return vals;
  }
}
