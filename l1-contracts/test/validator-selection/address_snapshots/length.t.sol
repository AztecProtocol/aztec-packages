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

  function test_WhenNoValidatorsAreRegistered() public view {
    // It returns 0
    assertEq(validatorSet.length(), 0);
  }

  function test_WhenAddingValidators(address[] memory _addrs) public {
    _addrs = boundUnique(_addrs);

    // It increases the length
    timeCheater.cheat__setEpochNow(1);
    // Length starts at zero
    assertEq(validatorSet.length(), 0);

    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.add(_addrs[i]);
    }
    // Length remains zero within this epoch
    assertEq(validatorSet.length(), 0);

    timeCheater.cheat__setEpochNow(2);
    // It increases after the epoch boundary
    assertEq(validatorSet.length(), _addrs.length);

    // Length at epoch maintains historical values
    assertEq(validatorSet.lengthAtEpoch(Epoch.wrap(1)), 0);
    assertEq(validatorSet.lengthAtEpoch(Epoch.wrap(2)), _addrs.length);
  }

  // It decrease the length
  function test_WhenRemovingValidators(address[] memory _addrs) public {
    _addrs = boundUnique(_addrs);

    // It decrease the length
    // It maintains historical values correctly
    timeCheater.cheat__setEpochNow(1);
    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.add(_addrs[i]);
    }

    timeCheater.cheat__setEpochNow(2);
    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.remove(_addrs[i]);
    }
    assertEq(validatorSet.length(), _addrs.length);

    timeCheater.cheat__setEpochNow(3);
    assertEq(validatorSet.length(), 0);

    // Length at epoch maintains historical values
    assertEq(validatorSet.lengthAtEpoch(Epoch.wrap(1)), 0);
    assertEq(validatorSet.lengthAtEpoch(Epoch.wrap(2)), _addrs.length);
    assertEq(validatorSet.lengthAtEpoch(Epoch.wrap(3)), 0);
  }
}
