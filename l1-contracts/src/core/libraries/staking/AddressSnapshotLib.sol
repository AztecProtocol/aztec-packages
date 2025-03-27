// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Timestamp, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";

import "forge-std/console.sol";

// The validator index -> the validator at that point in time
struct SnapshottedAddressSet {
  uint256 size;
  mapping(uint256 index => AddressSnapshot[]) checkpoints;
  // Store up to date position for each validator
  mapping(address validator => uint256 index) validatorToIndex;
}

struct AddressSnapshot {
  address addr;
  uint96 epochNumber;
}

// TODO(md): think about this in the context of the enumerable set a bit more
// -

// @note
// Do we want to be able to remove somebody from the validator set by their index?
// Or do we want to be able to remove them via their address, like the enumerable set?
// What is the most efficient way to implement such a thing

library AddressSnapshotLib {
  function add(SnapshottedAddressSet storage _self, address _validator) internal returns (bool) {
    // Insert into the end of the array
    uint256 index = _self.size;

    // TODO: tidy up
    uint256 _epochNumber = Epoch.unwrap(TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp)));

    // TODO: check double insertion??

    // Include max bit to indicate that the validator is in the set - means 0 index is not 0
    uint256 indexWithBit = index | (1 << 255);
    console.log(" inserting validator", _validator);
    console.log(" at index");
    console.logBytes32(bytes32(indexWithBit));

    _self.validatorToIndex[_validator] = indexWithBit;
    _self.checkpoints[index].push(
      AddressSnapshot({addr: _validator, epochNumber: uint96(_epochNumber)})
    );
    _self.size += 1;
    return true;
  }

  function remove(SnapshottedAddressSet storage _self, uint256 _index) internal returns (bool) {
    // To remove from the list, we push the last item into the index and reduce the size
    uint256 lastIndex = _self.size - 1;
    uint256 lastSnapshotLength = _self.checkpoints[lastIndex].length;

    // TODO: tidy up
    uint256 epochNow = Epoch.unwrap(TimeLib.epochFromTimestamp(Timestamp.wrap(block.timestamp)));

    AddressSnapshot memory lastSnapshot = _self.checkpoints[lastIndex][lastSnapshotLength - 1];

    address lastValidator = lastSnapshot.addr;
    uint256 newLocationWithMask = _index | (1 << 255);
    _self.validatorToIndex[lastValidator] = newLocationWithMask; // Remove the last validator from the index

    // If we are removing the last item, we cannot swap it with anything
    // so we append a new address of zero for this epoch
    if (lastIndex == _index) {
      lastSnapshot.addr = address(0);
    }

    require(lastSnapshot.epochNumber != epochNow, "Cannot edit an item twice within the same epoch");

    lastSnapshot.epochNumber = uint96(epochNow);
    _self.checkpoints[_index].push(lastSnapshot);
    _self.size -= 1;
    return true;
  }

  function remove(SnapshottedAddressSet storage _self, address _validator) internal returns (bool) {
    uint256 index = _self.validatorToIndex[_validator];
    require(index != 0, "Validator not found");

    // Remove top most bit
    index = index & ~uint256(1 << 255);
    return remove(_self, index);
  }

  function at(SnapshottedAddressSet storage _self, uint256 _index) internal view returns (address) {
    return getAddressFromIndexNow(_self, _index);
  }

  function getAddressFromIndexNow(SnapshottedAddressSet storage _self, uint256 _index)
    internal
    view
    returns (address)
  {
    uint256 numCheckpoints = _self.checkpoints[_index].length;

    if (_index >= _self.size) {
      return address(0);
    }

    if (numCheckpoints == 0) {
      return address(0);
    }

    AddressSnapshot memory lastSnapshot = _self.checkpoints[_index][numCheckpoints - 1];
    return lastSnapshot.addr;
  }

  function getAddressFromIndexAtEpoch(
    SnapshottedAddressSet storage _self,
    uint256 _index,
    uint256 _epoch
  ) internal view returns (address) {
    uint256 numCheckpoints = _self.checkpoints[_index].length;
    uint96 epoch = uint96(_epoch);

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

    return _self.checkpoints[_index][lower].addr;
  }

  function length(SnapshottedAddressSet storage _self) internal view returns (uint256) {
    return _self.size;
  }

  // TODO: ideally we would not have this - created to match with the enumerable set
  function values(SnapshottedAddressSet storage _self) internal view returns (address[] memory) {
    address[] memory vals = new address[](_self.size);
    for (uint256 i = 0; i < _self.size; i++) {
      vals[i] = getAddressFromIndexNow(_self, i);
    }
    return vals;
  }
}
