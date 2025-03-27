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

  function add(address _validator) public {
    AddressSnapshotLib.add(validatorSet, _validator);
  }

  function remove(uint256 _index) public {
    AddressSnapshotLib.remove(validatorSet, _index);
  }

  function remove(address _validator) public {
    AddressSnapshotLib.remove(validatorSet, _validator);
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

  function test_at_() public {
    // Empty should return 0
    vm.expectRevert();
    libTest.at(0);

    libTest.add(address(1));
    libTest.add(address(2));
    libTest.add(address(3));

    assertEq(libTest.at(0), address(1));
    assertEq(libTest.at(1), address(2));
    assertEq(libTest.at(2), address(3));
  }

  function test_getAddresssIndexAt() public {
    // Empty should return 0
    timeCheater.cheat__setEpochNow(0);
    assertEq(libTest.getAddressFromIndexAtEpoch(0, 0), address(0));

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
}
