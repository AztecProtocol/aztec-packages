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

contract AddressSnapshotValuesTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenNoValidatorsAreRegistered() public view {
    // It returns empty array
    address[] memory vals = validatorSet.values();
    assertEq(vals.length, 0);
  }

  function test_WhenValidatorsExist() public {
    // It returns array with correct length
    // It returns array with addresses in order

    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    validatorSet.add(address(2));
    validatorSet.add(address(3));

    // Length remains 0 within this epoch
    address[] memory vals = validatorSet.values();
    assertEq(vals.length, 0);

    // Move to next epoch for changes to take effect
    timeCheater.cheat__setEpochNow(2);
    vals = validatorSet.values();
    assertEq(vals.length, 3);
    assertEq(vals[0], address(1));
    assertEq(vals[1], address(2));
    assertEq(vals[2], address(3));
  }

  function test_WhenValidatorsHaveNotChangedForSomeTime() public {
    // It returns array with correct length
    // It returns array with correct addresses in order

    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    validatorSet.add(address(2));
    validatorSet.add(address(3));

    timeCheater.cheat__setEpochNow(100);
    address[] memory vals = validatorSet.values();
    assertEq(vals.length, 3);
    assertEq(vals[0], address(1));
    assertEq(vals[1], address(2));
    assertEq(vals[2], address(3));

    // Values at epoch maintains historical values
    address[] memory valsAtEpoch = validatorSet.valuesAtEpoch(Epoch.wrap(1));
    assertEq(valsAtEpoch.length, 0);
  }

  function test_WhenQueryingValuesForFutureEpoch() public {
    // It reverts
    timeCheater.cheat__setEpochNow(1);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.AddressSnapshotLib__RequestingLengthForFutureEpoch.selector,
        Epoch.wrap(2),
        Epoch.wrap(1)
      )
    );
    validatorSet.valuesAtEpoch(Epoch.wrap(2));
  }

  function test_WhenValidatorsAreRemoved() public {
    // It returns array of remaining validators
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

    // Values at epoch maintains historical values
    address[] memory valsAtEpoch = validatorSet.valuesAtEpoch(Epoch.wrap(1));
    assertEq(valsAtEpoch.length, 0);

    valsAtEpoch = validatorSet.valuesAtEpoch(Epoch.wrap(2));
    assertEq(valsAtEpoch.length, 3);
    assertEq(valsAtEpoch[0], address(1));
    assertEq(valsAtEpoch[1], address(2));
    assertEq(valsAtEpoch[2], address(3));

    valsAtEpoch = validatorSet.valuesAtEpoch(Epoch.wrap(3));
    assertEq(valsAtEpoch.length, 2);
    assertEq(valsAtEpoch[0], address(1));
    assertEq(valsAtEpoch[1], address(3));
  }
}
