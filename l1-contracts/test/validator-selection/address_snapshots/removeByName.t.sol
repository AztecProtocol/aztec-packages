// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";

contract RemoveByNameTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenAddressNotInTheSet() public {
    assertFalse(validatorSet.remove(address(1)));
  }

  function test_WhenValidatorIsInTheSet() public {
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));

    timeCheater.cheat__setEpochNow(2);
    assertTrue(validatorSet.remove(address(1)));
    assertEq(validatorSet.length(), 0);
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(2)), address(0));
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(1)), address(1));
  }

  function test_WhenRemovingMultipleValidators() public {
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    validatorSet.add(address(2));
    validatorSet.add(address(3));

    timeCheater.cheat__setEpochNow(2);
    validatorSet.remove(address(2));

    address[] memory vals = validatorSet.values();
    assertEq(vals.length, 2);
    assertEq(vals[0], address(1));
    assertEq(vals[1], address(3));

    timeCheater.cheat__setEpochNow(3);
    validatorSet.remove(address(1));

    vals = validatorSet.values();
    assertEq(vals.length, 1);
    assertEq(vals[0], address(3));

    // Verify snapshots
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(1)), address(1));
    assertEq(validatorSet.getAddressFromIndexAtEpoch(1, Epoch.wrap(1)), address(2));
    assertEq(validatorSet.getAddressFromIndexAtEpoch(2, Epoch.wrap(1)), address(3));

    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(2)), address(1));
    assertEq(validatorSet.getAddressFromIndexAtEpoch(1, Epoch.wrap(2)), address(3));
  }
}
