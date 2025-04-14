// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";

contract AtTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenNoValidatorsAreRegistered() public {
    // It reverts
    vm.expectRevert();
    validatorSet.at(0);
  }

  function test_WhenIndexIsOutOfBounds() public {
    // It reverts
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));

    vm.expectRevert();
    validatorSet.at(1);
  }

  function test_WhenIndexIsValid() public {
    // it returns the current validator at that index
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    validatorSet.add(address(2));
    validatorSet.add(address(3));

    assertEq(validatorSet.at(0), address(1));
    assertEq(validatorSet.at(1), address(2));
    assertEq(validatorSet.at(2), address(3));

    // it returns the correct validator after reordering
    timeCheater.cheat__setEpochNow(2);
    validatorSet.remove(1);

    assertEq(validatorSet.at(0), address(1));
    assertEq(validatorSet.at(1), address(3));
  }
}
