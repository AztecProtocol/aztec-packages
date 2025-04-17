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
 * @param attestorToIndex Mapping of attestor address to its current index in the set
 */
struct SnapshottedAddressSet {
  // This size must also be snapshotted
  Checkpoints.Trace224 size;
  mapping(uint256 index => Checkpoints.Trace224) checkpoints;
  // Store up to date position for each address
  mapping(address addr => Index index) addressToIndex;
}

struct Index {
  bool exists;
  uint224 index;
}

/**
 * @title AddressSnapshotLib
 * @notice A library for managing a set of addresses with historical snapshots
 * @dev This library provides functionality similar to EnumerableSet but can track addresses across different epochs
 *      and allows querying the state of addresses at any point in time
 */
library AddressSnapshotLib {
  using SafeCast for *;
  using Checkpoints for Checkpoints.Trace224;

  /**
   * @notice Adds a validator to the set
   * @param _self The storage reference to the set
   * @param _address The address to add
   * @return bool True if the address was added, false if it was already present
   */
  function add(SnapshottedAddressSet storage _self, address _address) internal returns (bool) {
    // Prevent against double insertion
    if (_self.addressToIndex[_address].exists) {
      return false;
    }

    // Insert into the end of the array
    Epoch _nextEpoch = TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp)) + Epoch.wrap(1);

    uint224 index = _self.size.latest();

    _self.addressToIndex[_address] = Index({exists: true, index: index});
    _self.checkpoints[index].push(
      Epoch.unwrap(_nextEpoch).toUint32(), uint160(_address).toUint224()
    );

    _self.size.push(Epoch.unwrap(_nextEpoch).toUint32(), (index + 1).toUint224());
    return true;
  }

  /**
   * @notice Removes a address from the set by address
   * @param _self The storage reference to the set
   * @param _address The address of the address to remove
   * @return bool True if the address was removed, false if it wasn't found
   */
  function remove(SnapshottedAddressSet storage _self, address _address) internal returns (bool) {
    Index memory index = _self.addressToIndex[_address];
    if (!index.exists) {
      return false;
    }

    return _remove(_self, index.index, _address);
  }

  /**
   * @notice Removes a validator from the set by index
   * @param _self The storage reference to the set
   * @param _index The index of the validator to remove
   * @return bool True if the validator was removed, false otherwise
   */
  function remove(SnapshottedAddressSet storage _self, uint224 _index) internal returns (bool) {
    address _address = address(_self.checkpoints[_index].latest().toUint160());
    return _remove(_self, _index, _address);
  }

  /**
   * @notice Removes a validator from the set by index
   * @param _self The storage reference to the set
   * @param _index The index of the validator to remove
   * @return bool True if the validator was removed, false otherwise
   */
  function _remove(SnapshottedAddressSet storage _self, uint224 _index, address _address)
    internal
    returns (bool)
  {
    uint224 size = _self.size.latest();
    if (_index >= size) {
      revert Errors.AddressSnapshotLib__IndexOutOfBounds(_index, size);
    }

    // To remove from the list, we push the last item into the index and reduce the size
    uint224 lastIndex = size - 1;
    uint256 nextEpoch =
      Epoch.unwrap(TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp)) + Epoch.wrap(1));

    address lastValidator = address(_self.checkpoints[lastIndex].latest().toUint160());

    // If we are removing the last item, we cannot swap it with anything
    // so we append a new address of zero for this epoch
    // And since we are removing it, we set the location to 0
    _self.addressToIndex[_address] = Index({exists: false, index: 0});
    if (lastIndex == _index) {
      _self.checkpoints[_index].push(nextEpoch.toUint32(), uint224(0));
    } else {
      // Otherwise, we swap the last item with the item we are removing
      // and update the location of the last item
      _self.addressToIndex[lastValidator] = Index({exists: true, index: _index.toUint224()});
      _self.checkpoints[_index].push(nextEpoch.toUint32(), uint160(lastValidator).toUint224());
    }

    _self.size.push(nextEpoch.toUint32(), (lastIndex).toUint224());
    return true;
  }

  /**
   * @notice Gets the current address at a specific index at the time right now
   * @param _self The storage reference to the set
   * @param _index The index to query
   * @return address The current address at the given index
   */
  function at(SnapshottedAddressSet storage _self, uint256 _index) internal view returns (address) {
    Epoch currentEpoch = TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp));
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
    uint256 size = lengthAtEpoch(_self, _epoch);

    if (_index >= size) {
      revert Errors.AddressSnapshotLib__IndexOutOfBounds(_index, size);
    }

    uint224 addr = _self.checkpoints[_index].upperLookup(Epoch.unwrap(_epoch).toUint32());
    return address(addr.toUint160());
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

  /**
   * @notice Gets the size of the set at a specific epoch
   * @param _self The storage reference to the set
   * @param _epoch The epoch number to query
   * @return uint256 The number of addresses in the set at the given epoch
   *
   * @dev Note, the values returned from this function are in flux if the epoch is in the future.
   */
  function lengthAtEpoch(SnapshottedAddressSet storage _self, Epoch _epoch)
    internal
    view
    returns (uint256)
  {
    return _self.size.upperLookup(Epoch.unwrap(_epoch).toUint32());
  }

  /**
   * @notice Gets all current addresses in the set
   * @param _self The storage reference to the set
   * @return address[] Array of all current addresses in the set
   */
  function values(SnapshottedAddressSet storage _self) internal view returns (address[] memory) {
    Epoch currentEpoch = TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp));
    return valuesAtEpoch(_self, currentEpoch);
  }

  /**
   * @notice Gets all addresses in the set at a specific epoch
   * @param _self The storage reference to the set
   * @param _epoch The epoch number to query
   * @return address[] Array of all addresses in the set at the given epoch
   *
   * @dev Note, the values returned from this function are in flux if the epoch is in the future.
   *
   */
  function valuesAtEpoch(SnapshottedAddressSet storage _self, Epoch _epoch)
    internal
    view
    returns (address[] memory)
  {
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
