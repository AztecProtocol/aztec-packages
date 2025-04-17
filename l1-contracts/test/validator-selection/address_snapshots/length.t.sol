// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

contract AddressSnapshotLengthTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenNoValidatorsAreRegistered() public view {
    // It returns 0
    assertEq(validatorSet.length(), 0);
  }

  function test_WhenAddingValidators() public {
    // It increases the length
    timeCheater.cheat__setEpochNow(1);
    // Length starts at zero
    assertEq(validatorSet.length(), 0);

    validatorSet.add(address(1));
    // Length remains zero within this epoch
    assertEq(validatorSet.length(), 0);

    validatorSet.add(address(2));
    // Length remains zero within this epoch
    assertEq(validatorSet.length(), 0);

    timeCheater.cheat__setEpochNow(2);
    // Length increases to 2
    assertEq(validatorSet.length(), 2);

    // Length at epoch maintains historical values
    assertEq(validatorSet.lengthAtEpoch(Epoch.wrap(1)), 0);
    assertEq(validatorSet.lengthAtEpoch(Epoch.wrap(2)), 2);
  }

  // It decrease the length
  function test_WhenRemovingValidators() public {
    // It decrease the length
    // It maintains historical values correctly
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    validatorSet.add(address(2));

    timeCheater.cheat__setEpochNow(2);
    validatorSet.remove(0);
    assertEq(validatorSet.length(), 2);

    validatorSet.remove(0);
    assertEq(validatorSet.length(), 2);

    timeCheater.cheat__setEpochNow(3);
    assertEq(validatorSet.length(), 0);

    // Length at epoch maintains historical values
    assertEq(validatorSet.lengthAtEpoch(Epoch.wrap(1)), 0);
    assertEq(validatorSet.lengthAtEpoch(Epoch.wrap(2)), 2);
    assertEq(validatorSet.lengthAtEpoch(Epoch.wrap(3)), 0);
  }
}
