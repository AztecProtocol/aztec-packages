// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

contract AddressSnapshotLengthTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenNoValidatorsAreRegistered(uint32 _ts) public view {
    // It returns 0
    assertEq(validatorSet.length(), 0);
    assertEq(validatorSet.lengthAtTimestamp(_ts), 0);
  }

  function test_WhenAddingValidators(address[] memory _addrs, uint16 _add2) public {
    uint32 ts = uint32(block.timestamp);
    uint32 ts2 = ts + uint32(bound(_add2, 1, 1000));

    _addrs = boundUnique(_addrs);
    assertEq(validatorSet.length(), 0);

    vm.warp(ts2);

    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.add(_addrs[i]);
    }
    assertEq(validatorSet.length(), _addrs.length);
    assertEq(validatorSet.lengthAtTimestamp(ts), 0);
    assertEq(validatorSet.lengthAtTimestamp(ts2), _addrs.length);
  }

  // It decrease the length
  function test_WhenRemovingValidators(address[] memory _addrs, uint16 _add2, uint16 _add3) public {
    uint32 ts = uint32(block.timestamp);
    uint32 ts2 = ts + uint32(bound(_add2, 1, 1000));
    uint32 ts3 = ts2 + uint32(bound(_add3, 1, 1000));

    _addrs = boundUnique(_addrs);

    // It decrease the length
    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.add(_addrs[i]);
    }
    assertEq(validatorSet.length(), _addrs.length);

    vm.warp(ts2);
    assertEq(validatorSet.length(), _addrs.length);

    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.remove(_addrs[i]);
    }
    assertEq(validatorSet.length(), 0);

    vm.warp(ts3);
    assertEq(validatorSet.length(), 0);

    // Length at epoch maintains historical values
    assertEq(validatorSet.lengthAtTimestamp(ts), _addrs.length);
    assertEq(validatorSet.lengthAtTimestamp(ts2), 0);
    assertEq(validatorSet.lengthAtTimestamp(ts3), 0);
  }
}
