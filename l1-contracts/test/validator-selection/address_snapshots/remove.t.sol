// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

contract AddressSnapshotRemoveTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenAddressNotInTheSet() public {
    // It returns false
    assertFalse(validatorSet.remove(address(1)));
  }

  function test_WhenValidatorIsInTheSet() public {
    // It returns true
    // It decreases the length
    // It updates the snapshot for that index
    // It maintains historical values correctly

    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    // Length remains 0 within this epoch
    assertEq(validatorSet.length(), 0);

    // Length increases to 1 in the next epoch
    timeCheater.cheat__setEpochNow(2);
    assertEq(validatorSet.length(), 1);

    assertTrue(validatorSet.remove(address(1)));
    // Length remains 1 within this epoch
    assertEq(validatorSet.length(), 1);

    timeCheater.cheat__setEpochNow(3);
    // Length decreases to 0 in the next epoch
    assertEq(validatorSet.length(), 0);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(3));

    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(2)), address(1));
  }

  function test_WhenValidatorRemovingAnIndexLargerThanTheCurrentLength() public {
    // It reverts
    timeCheater.cheat__setEpochNow(1);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.remove(0);

    // Add some validators
    validatorSet.add(address(1));
    validatorSet.add(address(2));
    validatorSet.add(address(3));

    timeCheater.cheat__setEpochNow(2);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 10, 3)
    );
    validatorSet.remove(10);
  }

  function test_WhenRemovingMultipleValidators() public {
    // It maintains correct order of remaining validators
    // It updates snapshots correctly for each removal

    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    validatorSet.add(address(2));
    validatorSet.add(address(3));

    timeCheater.cheat__setEpochNow(2);
    validatorSet.remove(address(2));

    timeCheater.cheat__setEpochNow(3);

    address[] memory vals = validatorSet.values();
    assertEq(vals.length, 2);
    assertEq(vals[0], address(1));
    assertEq(vals[1], address(3));

    validatorSet.remove(address(1));
    timeCheater.cheat__setEpochNow(4);

    vals = validatorSet.values();
    assertEq(vals.length, 1);
    assertEq(vals[0], address(3));

    // Verify snapshots
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(2)), address(1));
    assertEq(validatorSet.getAddressFromIndexAtEpoch(1, Epoch.wrap(2)), address(2));
    assertEq(validatorSet.getAddressFromIndexAtEpoch(2, Epoch.wrap(2)), address(3));

    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(3)), address(1));
    assertEq(validatorSet.getAddressFromIndexAtEpoch(1, Epoch.wrap(3)), address(3));
  }
}
