// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Test} from "forge-std/Test.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {TimeCheater} from "../../staking/TimeCheater.sol";

contract ExpectRevertWrapper {
  using AddressSnapshotLib for SnapshottedAddressSet;

  SnapshottedAddressSet validatorSet;

  function at(uint256 index) public view returns (address) {
    return validatorSet.at(index);
  }

  function add(address validator) public {
    validatorSet.add(validator);
  }

  function remove(uint256 index) public {
    validatorSet.remove(index);
  }
}

contract AddressSnapshotAtTest is Test {
  ExpectRevertWrapper expectRevertWrapper;
  TimeCheater timeCheater;

  function setUp() public {
    expectRevertWrapper = new ExpectRevertWrapper();
    timeCheater = new TimeCheater(address(expectRevertWrapper), block.timestamp, 1, 1);
  }

  function test_WhenNoValidatorsAreRegistered() public {
    // It reverts
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    expectRevertWrapper.at(0);
  }

  function test_WhenIndexIsOutOfBounds() public {
    expectRevertWrapper.add(address(1));

    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 1, 0)
    );
    expectRevertWrapper.at(1);
  }

  function test_WhenIndexIsValid() public {
    // it returns the current validator at that index
    timeCheater.cheat__setEpochNow(1);
    expectRevertWrapper.add(address(1));
    expectRevertWrapper.add(address(2));
    expectRevertWrapper.add(address(3));

    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    expectRevertWrapper.at(0);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 1, 0)
    );
    expectRevertWrapper.at(1);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 2, 0)
    );
    expectRevertWrapper.at(2);

    // it returns the correct validator after reordering
    timeCheater.cheat__setEpochNow(2);
    assertEq(expectRevertWrapper.at(0), address(1));
    assertEq(expectRevertWrapper.at(1), address(2));
    assertEq(expectRevertWrapper.at(2), address(3));

    expectRevertWrapper.remove(1);

    assertEq(expectRevertWrapper.at(0), address(1));
    assertEq(expectRevertWrapper.at(1), address(2));
    assertEq(expectRevertWrapper.at(2), address(3));

    timeCheater.cheat__setEpochNow(3);
    assertEq(expectRevertWrapper.at(0), address(1));
    assertEq(expectRevertWrapper.at(1), address(3));
  }
}
