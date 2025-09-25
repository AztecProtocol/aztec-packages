// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {Checkpoints} from "@oz/utils/structs/Checkpoints.sol";

/**
 * @notice Structure to store a set of addresses with their historical snapshots
 * @param size The timestamped history of the number of addresses in the set
 * @param indexToAddressHistory Mapping of index to array of timestamped address history
 * @param addressToCurrentIndex Mapping of address to its current index in the set
 */
struct SnapshottedAddressSet {
  // This size must also be snapshotted
  Checkpoints.Trace224 size;
  // For each index, store the timestamped history of addresses
  mapping(uint256 index => Checkpoints.Trace224) indexToAddressHistory;
  // For each address, store its current index in the set
  mapping(address addr => Index index) addressToCurrentIndex;
}

struct Index {
  bool exists;
  uint224 index;
}

// AddressSnapshotLib
error AddressSnapshotLib__IndexOutOfBounds(uint256 index, uint256 size); // 0xd789b71a
error AddressSnapshotLib__CannotAddAddressZero();

/**
 * @title AddressSnapshotLib
 * @notice A library for managing a set of addresses with historical snapshots
 * @dev This library provides functionality similar to EnumerableSet but can track addresses across time
 *      and allows querying the state of addresses at any point in time. This is used to track the
 *      list of stakers on a particular rollup instance in the GSE throughout time.
 *
 * The SnapshottedAddressSet is maintained such that the you can take a timestamp, and from it:
 * 1. Get the `size` of the set at that timestamp
 * 2. Query the first `size` indices in `indexToAddressHistory` at that timestamp to get a set of addresses of size
 * `size`
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
    require(_address != address(0), AddressSnapshotLib__CannotAddAddressZero());
    // Prevent against double insertion
    if (_self.addressToCurrentIndex[_address].exists) {
      return false;
    }

    uint224 index = _self.size.latest();
    _self.addressToCurrentIndex[_address] = Index({exists: true, index: index});

    uint32 key = block.timestamp.toUint32();

    _self.indexToAddressHistory[index].push(key, uint160(_address).toUint224());
    _self.size.push(key, (index + 1).toUint224());

    return true;
  }

  /**
   * @notice Removes a address from the set by address
   *
   * @param _self The storage reference to the set
   * @param _address The address of the address to remove
   * @return bool True if the address was removed, false if it wasn't found
   */
  function remove(SnapshottedAddressSet storage _self, address _address) internal returns (bool) {
    Index memory index = _self.addressToCurrentIndex[_address];
    if (!index.exists) {
      return false;
    }

    return _remove(_self, index.index, _address);
  }

  /**
   * @notice Removes a validator from the set by index
   * @param _self The storage reference to the set
   * @param _index The index of the validator to remove
   * @return bool True if the validator was removed, reverts otherwise
   */
  function remove(SnapshottedAddressSet storage _self, uint224 _index) internal returns (bool) {
    address _address = address(_self.indexToAddressHistory[_index].latest().toUint160());
    return _remove(_self, _index, _address);
  }

  /**
   * @notice Removes a validator from the set
   * @param _self The storage reference to the set
   * @param _index The index of the validator to remove
   * @param _address The address to remove
   * @return bool True if the validator was removed, reverts otherwise
   */
  function _remove(SnapshottedAddressSet storage _self, uint224 _index, address _address) internal returns (bool) {
    uint224 currentSize = _self.size.latest();
    if (_index >= currentSize) {
      revert AddressSnapshotLib__IndexOutOfBounds(_index, currentSize);
    }

    // Mark the address to remove as not existing
    _self.addressToCurrentIndex[_address] = Index({exists: false, index: 0});

    // Now we need to update the indexToAddressHistory.
    // Suppose the current size is 3, and we are removing Bob from index 1, and Charlie is at index 2.
    // We effectively push Charlie into the snapshot at index 1,
    // then update Charlie in addressToCurrentIndex to reflect the new index of 1.

    uint224 lastIndex = currentSize - 1;
    uint32 key = block.timestamp.toUint32();

    // If not removing the last item, swap the value of the last item into the `_index` to remove
    if (lastIndex != _index) {
      address lastValidator = address(_self.indexToAddressHistory[lastIndex].latest().toUint160());

      _self.addressToCurrentIndex[lastValidator] = Index({exists: true, index: _index.toUint224()});
      _self.indexToAddressHistory[_index].push(key, uint160(lastValidator).toUint224());
    }

    // Then "pop" the last index by setting the value to `address(0)`
    _self.indexToAddressHistory[lastIndex].push(key, uint224(0));

    // Finally, we update the size to reflect the new size of the set.
    _self.size.push(key, (lastIndex).toUint224());
    return true;
  }

  /**
   * @notice Gets the current address at a specific index at the time right now
   * @param _self The storage reference to the set
   * @param _index The index to query
   * @return address The current address at the given index
   */
  function at(SnapshottedAddressSet storage _self, uint256 _index) internal view returns (address) {
    return getAddressFromIndexAtTimestamp(_self, _index, block.timestamp.toUint32());
  }

  /**
   * @notice Gets the address at a specific index and timestamp
   * @param _self The storage reference to the set
   * @param _index The index to query
   * @param _timestamp The timestamp to query
   * @return address The address at the given index and timestamp
   */
  function getAddressFromIndexAtTimestamp(SnapshottedAddressSet storage _self, uint256 _index, uint32 _timestamp)
    internal
    view
    returns (address)
  {
    uint256 size = lengthAtTimestamp(_self, _timestamp);
    require(_index < size, AddressSnapshotLib__IndexOutOfBounds(_index, size));

    // Since the _index is less than the size, we know that the address at _index
    // exists at/before _timestamp.
    uint224 addr = _self.indexToAddressHistory[_index].upperLookup(_timestamp);
    return address(addr.toUint160());
  }

  /**
   * @notice Gets the address at a specific index and timestamp
   *
   * @dev     The caller MUST have ensure that `_index` < `size`
   *          at the `_timestamp` provided.
   * @dev     Primed for recent checkpoints in the address history.
   *
   * @param _self The storage reference to the set
   * @param _index The index to query
   * @param _timestamp The timestamp to query
   * @return address The address at the given index and timestamp
   */
  function unsafeGetRecentAddressFromIndexAtTimestamp(
    SnapshottedAddressSet storage _self,
    uint256 _index,
    uint32 _timestamp
  ) internal view returns (address) {
    uint224 addr = _self.indexToAddressHistory[_index].upperLookupRecent(_timestamp);
    return address(addr.toUint160());
  }

  /**
   * @notice Gets the current size of the set
   * @param _self The storage reference to the set
   * @return uint256 The number of addresses in the set
   */
  function length(SnapshottedAddressSet storage _self) internal view returns (uint256) {
    return lengthAtTimestamp(_self, block.timestamp.toUint32());
  }

  /**
   * @notice Gets the size of the set at a specific timestamp
   * @param _self The storage reference to the set
   * @param _timestamp The timestamp to query
   * @return uint256 The number of addresses in the set at the given timestamp
   *
   * @dev Note, the values returned from this function are in flux if the timestamp is in the future.
   */
  function lengthAtTimestamp(SnapshottedAddressSet storage _self, uint32 _timestamp) internal view returns (uint256) {
    return _self.size.upperLookup(_timestamp);
  }

  /**
   * @notice Gets all current addresses in the set
   *
   * @dev This function is only used in tests.
   *
   * @param _self The storage reference to the set
   * @return address[] Array of all current addresses in the set
   */
  function values(SnapshottedAddressSet storage _self) internal view returns (address[] memory) {
    return valuesAtTimestamp(_self, block.timestamp.toUint32());
  }

  /**
   * @notice Gets all addresses in the set at a specific timestamp
   *
   * @dev This function is only used in tests.
   *
   * @param _self The storage reference to the set
   * @param _timestamp The timestamp to query
   * @return address[] Array of all addresses in the set at the given timestamp
   *
   * @dev Note, the values returned from this function are in flux if the timestamp is in the future.
   *
   */
  function valuesAtTimestamp(SnapshottedAddressSet storage _self, uint32 _timestamp)
    internal
    view
    returns (address[] memory)
  {
    uint256 size = lengthAtTimestamp(_self, _timestamp);
    address[] memory vals = new address[](size);
    for (uint256 i; i < size;) {
      vals[i] = getAddressFromIndexAtTimestamp(_self, i, _timestamp);

      unchecked {
        ++i;
      }
    }
    return vals;
  }

  function contains(SnapshottedAddressSet storage _self, address _address) internal view returns (bool) {
    return _self.addressToCurrentIndex[_address].exists;
  }
}
