// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {TimeLib, TimeStorage, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TimeCheater} from "../staking/TimeCheater.sol";

contract LibTest {
  SnapshottedAddressSet validatorSet;

  function add(address _validator) public returns (bool) {
    return AddressSnapshotLib.add(validatorSet, _validator);
  }

  function remove(uint256 _index) public returns (bool) {
    return AddressSnapshotLib.remove(validatorSet, _index);
  }

  function remove(address _validator) public returns (bool) {
    return AddressSnapshotLib.remove(validatorSet, _validator);
  }

  function at(uint256 _index) public view returns (address) {
    return AddressSnapshotLib.at(validatorSet, _index);
  }

  function getAddressFromIndexAtEpoch(uint256 _index, uint256 _epoch) public view returns (address) {
    return AddressSnapshotLib.getAddressFromIndexAtEpoch(validatorSet, _index, Epoch.wrap(_epoch));
  }

  function length() public view returns (uint256) {
    return AddressSnapshotLib.length(validatorSet);
  }

  function values() public view returns (address[] memory) {
    return AddressSnapshotLib.values(validatorSet);
  }
}

contract AddressSnapshotsTest is Test {
  uint256 private constant SLOT_DURATION = 36;
  uint256 private constant EPOCH_DURATION = 48;

  uint256 private immutable GENESIS_TIME = block.timestamp;

  LibTest libTest;
  TimeCheater timeCheater;

  function setUp() public {
    libTest = new LibTest();

    // Enable us to modify TimeLib functions for libTest
    timeCheater = new TimeCheater(address(libTest), GENESIS_TIME, SLOT_DURATION, EPOCH_DURATION);
  }

  function test_getAddresssIndexAt() public {
    // Adds validator 1 to the first index in the set, at epoch 1
    timeCheater.cheat__setEpochNow(1);

    libTest.add(address(1));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 1), address(1));

    // Remove index 0 from the set, in the new epoch
    timeCheater.cheat__setEpochNow(2);

    libTest.remove( /* index */ 0);

    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 2), address(0));

    // Add validator 2 to the first index in the set
    timeCheater.cheat__setEpochNow(3);

    libTest.add(address(2));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 3), address(2));

    // Setup and remove the last item in the set alot of times
    timeCheater.cheat__setEpochNow(4);
    libTest.remove( /* index */ 0);

    timeCheater.cheat__setEpochNow(5);
    libTest.add(address(3));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 5), address(3));

    timeCheater.cheat__setEpochNow(6);
    libTest.remove( /* index */ 0);

    timeCheater.cheat__setEpochNow(7);
    libTest.add(address(4));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 7), address(4));

    // Expect past values to be maintained
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 1), address(1));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 2), address(0));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 3), address(2));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 4), address(0));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 5), address(3));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 6), address(0));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 7), address(4));
  }

  function test_length() public {
    assertEq(libTest.length(), 0);

    libTest.add(address(1));
    assertEq(libTest.length(), 1);

    timeCheater.cheat__setEpochNow(1);
    libTest.remove( /* index */ 0);
    assertEq(libTest.length(), 0);

    timeCheater.cheat__setEpochNow(2);
    libTest.add(address(1));
    libTest.add(address(2));
    assertEq(libTest.length(), 2);

    timeCheater.cheat__setEpochNow(3);
    libTest.remove( /* index */ 0);
    assertEq(libTest.length(), 1);
  }

  function test_values() public {
    libTest.add(address(1));
    libTest.add(address(2));
    libTest.add(address(3));

    address[] memory values = libTest.values();
    assertEq(values.length, 3);
    assertEq(values[0], address(1));
    assertEq(values[1], address(2));
    assertEq(values[2], address(3));
  }

  function test_remove_by_name() public {
    libTest.add(address(1));
    libTest.add(address(2));
    libTest.add(address(3));

    timeCheater.cheat__setEpochNow(1);
    libTest.remove(address(2));

    // Order flips
    address[] memory values = libTest.values();
    assertEq(values.length, 2);
    assertEq(values[0], address(1));
    assertEq(values[1], address(3));

    timeCheater.cheat__setEpochNow(2);
    libTest.remove(address(3));

    values = libTest.values();
    assertEq(values.length, 1);
    assertEq(values[0], address(1));

    timeCheater.cheat__setEpochNow(3);
    libTest.add(address(4));

    values = libTest.values();
    assertEq(values.length, 2);
    assertEq(values[0], address(1));
    assertEq(values[1], address(4));

    timeCheater.cheat__setEpochNow(4);
    libTest.remove(address(1));

    values = libTest.values();
    assertEq(values.length, 1);
    assertEq(values[0], address(4));
  }

  function test_at() public {
    libTest.add(address(1));
    libTest.add(address(2));
    libTest.add(address(3));

    // Index 1 is the first item in the set
    assertEq(libTest.at(0), address(1));
    assertEq(libTest.at(1), address(2));
    assertEq(libTest.at(2), address(3));

    timeCheater.cheat__setEpochNow(1);
    libTest.remove( /* index */ 1);

    // When removing and item, the index has become shuffled
    assertEq(libTest.at(0), address(1));
    assertEq(libTest.at(1), address(3));

    // Expect past values to be maintained
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 0), address(1));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 1), address(1));
  }

  function test_WhenNoValidatorsAreRegistered() external {
    vm.expectRevert();
    libTest.at(0);

    // it causes getAddressFromIndexAtEpoch to return revert
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 0), address(0));
  }

  modifier whenAddingAValidator() {
    libTest.add(address(1));
    _;
  }

  function test_WhenAlreadyAdded() external whenAddingAValidator {
    // it returns false
    assertFalse(libTest.add(address(1)));
  }

  function test_WhenNotPreviouslyAdded() external whenAddingAValidator {
    // it returns true
    assertTrue(libTest.add(address(2)));
    // it increases the length
    assertEq(libTest.length(), 2);

    // it creates a checkpoint
    timeCheater.cheat__setEpochNow(1);
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 0), address(1));
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 1, /* epoch */ 0), address(2));
  }

  function test_cannotRemoveAddressNotInTheSet() external {
    // it returns false
    assertFalse(libTest.remove(address(1)));
  }

  function test_WhenValidatorIsInTheSet() external {
    // it returns true
    libTest.add(address(1));
    timeCheater.cheat__setEpochNow(1);

    assertTrue(libTest.remove(address(1)));
    // it decreases the length
    assertEq(libTest.length(), 0);
    // it updates the snapshot for that index
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 1), address(0));

    // it maintains historical values correctly
    assertEq(libTest.getAddressFromIndexAtEpoch( /* index */ 0, /* epoch */ 0), address(1));
  }

  function test_WhenIndexIsOutOfBounds() external {
    // it reverts with IndexOutOfBounds
    vm.expectRevert();
    libTest.at(1);
  }

  function test_WhenIndexIsValid() external {
    // it returns the current validator at that index
    libTest.add(address(1));
    assertEq(libTest.at(0), address(1));
  }
}
