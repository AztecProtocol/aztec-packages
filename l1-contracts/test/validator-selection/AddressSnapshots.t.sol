// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {AddressSnapshotLib, SnapshottedAddressSet} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {TimeLib, TimeStorage} from "@aztec/core/libraries/TimeLib.sol";

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

  function getValidatorInIndexNow(uint256 _index) public view returns (address) {
    return AddressSnapshotLib.getValidatorInIndexNow(validatorSet, _index);
  }

  function getAddresssIndexAt(uint256 _index, uint256 _epoch) public view returns (address) {
    return AddressSnapshotLib.getAddresssIndexAt(validatorSet, _index, _epoch);
  }

  function length() public view returns (uint256) {
    return AddressSnapshotLib.length(validatorSet);
  }

  function values() public view returns (address[] memory) {
    return AddressSnapshotLib.values(validatorSet);
  }
}

contract AddressSnapshotsTest is Test {
  bytes32 private constant TIME_STORAGE_POSITION = keccak256("aztec.time.storage");
  uint256 private constant SLOT_DURATION = 36;
  uint256 private constant EPOCH_DURATION = 48;

  uint256 private immutable GENESIS_TIME = block.timestamp;

  LibTest libTest;

  function setUp() public {
    libTest = new LibTest();

    // Set the time storage
    setTimeStorage(
      TimeStorage({
        genesisTime: uint128(GENESIS_TIME),
        slotDuration: uint32(SLOT_DURATION),
        epochDuration: uint32(EPOCH_DURATION)
      })
    );
  }

  function getTimeStorage() public view returns (TimeStorage memory) {
    return abi.decode(bytes.concat(vm.load(address(libTest), TIME_STORAGE_POSITION)), (TimeStorage));
  }

  function setTimeStorage(TimeStorage memory _timeStorage) public {
    vm.store(
      address(libTest),
      TIME_STORAGE_POSITION,
      bytes32(
        abi.encodePacked(
          // Encoding order is a fun one
          bytes8(0),
          _timeStorage.epochDuration,
          _timeStorage.slotDuration,
          _timeStorage.genesisTime
        )
      )
    );
  }

  function cheat__setEpochNow(uint256 _epoch) public {
    vm.warp(GENESIS_TIME + 1 + _epoch * SLOT_DURATION * EPOCH_DURATION);
  }

  function test_getValidatorInIndexNow() public {
    // Empty should return 0
    assertEq(libTest.getValidatorInIndexNow(0), address(0));

    libTest.add(address(1));
    libTest.add(address(2));
    libTest.add(address(3));

    assertEq(libTest.getValidatorInIndexNow(0), address(1));
    assertEq(libTest.getValidatorInIndexNow(1), address(2));
    assertEq(libTest.getValidatorInIndexNow(2), address(3));
  }

  function test_getAddresssIndexAt() public {
    // Empty should return 0
    cheat__setEpochNow(0);
    assertEq(libTest.getAddresssIndexAt(0, 0), address(0));

    // Adds validator 1 to the first index in the set, at epoch 1
    cheat__setEpochNow(1);

    libTest.add(address(1));
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 1), address(1));

    // Remove index 0 from the set, in the new epoch
    cheat__setEpochNow(2);

    libTest.remove( /* index */ 0);

    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 2), address(0));

    // Add validator 2 to the first index in the set
    cheat__setEpochNow(3);

    libTest.add(address(2));
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 3), address(2));

    // Setup and remove the last item in the set alot of times
    cheat__setEpochNow(4);
    libTest.remove( /* index */ 0);

    cheat__setEpochNow(5);
    libTest.add(address(3));
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 5), address(3));

    cheat__setEpochNow(6);
    libTest.remove( /* index */ 0);

    cheat__setEpochNow(7);
    libTest.add(address(4));
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 7), address(4));

    // Expect past values to be maintained
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 1), address(1));
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 2), address(0));
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 3), address(2));
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 4), address(0));
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 5), address(3));
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 6), address(0));
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 7), address(4));
  }

  function test_length() public {
    assertEq(libTest.length(), 0);

    libTest.add(address(1));
    assertEq(libTest.length(), 1);

    cheat__setEpochNow(1);
    libTest.remove( /* index */ 0);
    assertEq(libTest.length(), 0);

    cheat__setEpochNow(2);
    libTest.add(address(1));
    libTest.add(address(2));
    assertEq(libTest.length(), 2);

    cheat__setEpochNow(3);
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

    cheat__setEpochNow(1);
    libTest.remove(address(2));

    address[] memory values = libTest.values();
    assertEq(values.length, 2);
    assertEq(values[0], address(1));
    assertEq(values[1], address(3));
  }

  function test_at() public {
    libTest.add(address(1));
    libTest.add(address(2));
    libTest.add(address(3));

    assertEq(libTest.at(0), address(1));
    assertEq(libTest.at(1), address(2));
    assertEq(libTest.at(2), address(3));

    cheat__setEpochNow(1);
    libTest.remove( /* index */ 0);

    // When removing and item, the index has become shuffled
    assertEq(libTest.at(0), address(3));
    assertEq(libTest.at(1), address(2));

    // Expect past values to be maintained
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 0), address(1));
    assertEq(libTest.getAddresssIndexAt( /* index */ 0, /* epoch */ 1), address(3));
  }
}
