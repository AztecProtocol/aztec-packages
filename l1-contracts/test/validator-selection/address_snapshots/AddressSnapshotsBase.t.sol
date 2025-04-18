// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";

import {Test} from "forge-std/Test.sol";
import {TimeLib, TimeStorage, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TimeCheater} from "../../staking/TimeCheater.sol";
import {TestConstants} from "../../harnesses/TestConstants.sol";

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

  function getAddressFromIndexAtEpoch(uint256 _index, Epoch _epoch) public view returns (address) {
    return validatorSet.getAddressFromIndexAtEpoch(_index, _epoch);
  }

  function length() public view returns (uint256) {
    return validatorSet.length();
  }

  function lengthAtEpoch(Epoch _epoch) public view returns (uint256) {
    return validatorSet.lengthAtEpoch(_epoch);
  }

  function values() public view returns (address[] memory) {
    return validatorSet.values();
  }

  function valuesAtEpoch(Epoch _epoch) public view returns (address[] memory) {
    return validatorSet.valuesAtEpoch(_epoch);
  }
}

contract AddressSnapshotsBase is Test {
  using AddressSnapshotLib for SnapshottedAddressSet;

  uint256 private constant SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
  uint256 private constant EPOCH_DURATION = TestConstants.AZTEC_EPOCH_DURATION;
  uint256 private immutable GENESIS_TIME = block.timestamp;

  AddressSetWrapper internal validatorSet;
  TimeCheater internal timeCheater;

  function boundUnique(address[] memory _addrs) internal pure returns (address[] memory) {
    // Ensure addresses within _addrSet1 are unique
    vm.assume(_addrs.length > 0);
    for (uint256 i = 0; i < _addrs.length; i++) {
      for (uint256 j = 0; j < i; j++) {
        vm.assume(_addrs[i] != _addrs[j]);
      }
    }
    return _addrs;
  }

  function setUp() public {
    validatorSet = new AddressSetWrapper();
    timeCheater =
      new TimeCheater(address(validatorSet), GENESIS_TIME, SLOT_DURATION, EPOCH_DURATION);
  }
}
