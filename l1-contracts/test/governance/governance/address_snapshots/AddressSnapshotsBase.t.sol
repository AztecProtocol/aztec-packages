// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/governance/libraries/AddressSnapshotLib.sol";

import {Test} from "forge-std/Test.sol";
import {TimeLib, TimeStorage, Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {TimeCheater} from "test/staking/TimeCheater.sol";
import {TestConstants} from "test/harnesses/TestConstants.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

contract AddressSetWrapper {
  using AddressSnapshotLib for SnapshottedAddressSet;

  SnapshottedAddressSet private validatorSet;

  function add(address _address) public returns (bool) {
    return validatorSet.add(_address);
  }

  function remove(uint224 _index) public returns (bool) {
    return validatorSet.remove(_index);
  }

  function remove(address _address) public returns (bool) {
    return validatorSet.remove(_address);
  }

  function at(uint256 _index) public view returns (address) {
    return validatorSet.at(_index);
  }

  function getAddressFromIndexAtTimestamp(uint256 _index, uint32 _timestamp)
    public
    view
    returns (address)
  {
    return validatorSet.getAddressFromIndexAtTimestamp(_index, _timestamp);
  }

  function length() public view returns (uint256) {
    return validatorSet.length();
  }

  function lengthAtTimestamp(uint32 _timestamp) public view returns (uint256) {
    return validatorSet.lengthAtTimestamp(_timestamp);
  }

  function values() public view returns (address[] memory) {
    return validatorSet.values();
  }

  function valuesAtTimestamp(uint32 _timestamp) public view returns (address[] memory) {
    return validatorSet.valuesAtTimestamp(_timestamp);
  }
}

contract AddressSnapshotsBase is Test {
  using AddressSnapshotLib for SnapshottedAddressSet;
  using TimeLib for Epoch;
  using SafeCast for uint256;

  uint256 private constant SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
  uint256 private constant EPOCH_DURATION = TestConstants.AZTEC_EPOCH_DURATION;
  uint256 private GENESIS_TIME;

  AddressSetWrapper internal validatorSet;
  TimeCheater internal timeCheater;

  function boundUnique(address[] memory _addrs) internal pure returns (address[] memory) {
    // Ensure addresses within _addrSet1 are unique
    vm.assume(_addrs.length > 0 && _addrs.length < 16);
    for (uint256 i = 0; i < _addrs.length; i++) {
      for (uint256 j = 0; j < i; j++) {
        vm.assume(_addrs[i] != _addrs[j]);
      }
    }
    return _addrs;
  }

  function setUp() public {
    vm.warp(block.timestamp + 1000);
    GENESIS_TIME = block.timestamp;
    TimeLib.initialize(GENESIS_TIME, SLOT_DURATION, EPOCH_DURATION);
    validatorSet = new AddressSetWrapper();
    timeCheater =
      new TimeCheater(address(validatorSet), GENESIS_TIME, SLOT_DURATION, EPOCH_DURATION);
  }
}
