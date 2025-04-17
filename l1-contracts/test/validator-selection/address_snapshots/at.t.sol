// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {TimeCheater} from "../../staking/TimeCheater.sol";
import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";

contract AddressSnapshotAtTest is AddressSnapshotsBase {

  function test_WhenNoValidatorsAreRegistered() public {
    // It reverts
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.at(0);
  }

  function test_WhenIndexIsOutOfBounds() public {
    validatorSet.add(address(1));

    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 1, 0)
    );
    validatorSet.at(1);
  }

  function test_WhenIndexIsValid() public {
    // it returns the current validator at that index
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    validatorSet.add(address(2));
    validatorSet.add(address(3));

    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.at(0);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 1, 0)
    );
    validatorSet.at(1);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 2, 0)
    );
    validatorSet.at(2);

    // it returns the correct validator after reordering
    timeCheater.cheat__setEpochNow(2);
    assertEq(validatorSet.at(0), address(1));
    assertEq(validatorSet.at(1), address(2));
    assertEq(validatorSet.at(2), address(3));

    validatorSet.remove(1);

    assertEq(validatorSet.at(0), address(1));
    assertEq(validatorSet.at(1), address(2));
    assertEq(validatorSet.at(2), address(3));

    timeCheater.cheat__setEpochNow(3);
    assertEq(validatorSet.at(0), address(1));
    assertEq(validatorSet.at(1), address(3));
  }
}
