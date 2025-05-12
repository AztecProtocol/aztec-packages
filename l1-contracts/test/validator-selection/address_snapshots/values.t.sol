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

  function test_WhenValidatorsExist(address[] memory _addrs) public {
    _addrs = boundUnique(_addrs);
    // It returns array with correct length
    // It returns array with addresses in order

    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.add(_addrs[i]);
    }

    address[] memory vals = validatorSet.values();
    assertEq(vals.length, _addrs.length);
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(vals[i], _addrs[i]);
    }
  }

  function test_WhenValidatorsHaveNotChangedForSomeTime(
    address[] memory _addrs,
    uint16 _epochsToJump
  ) public {
    _addrs = boundUnique(_addrs);
    uint32 ts = uint32(block.timestamp);

    // It returns array with correct length
    // It returns array with correct addresses in order

    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.add(_addrs[i]);
    }

    timeCheater.cheat__jumpForwardEpochs(bound(_epochsToJump, 1, 1000));
    address[] memory vals = validatorSet.values();
    assertEq(vals.length, _addrs.length);
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(vals[i], _addrs[i]);
    }

    // historical values
    address[] memory valsAtEpoch = validatorSet.valuesAtTimestamp(ts - 1);
    assertEq(valsAtEpoch.length, 0);
  }

  function test_WhenValidatorsAreRemoved(uint16 _add2, uint16 _add3) public {
    uint32 ts = uint32(block.timestamp);
    uint32 ts2 = ts + uint32(bound(_add2, 1, 1000));
    uint32 ts3 = ts2 + uint32(bound(_add3, 1, 1000));

    // It returns array of remaining validators
    validatorSet.add(address(1));
    validatorSet.add(address(2));
    validatorSet.add(address(3));

    vm.warp(ts2);
    validatorSet.remove(address(2));

    vm.warp(ts3);

    address[] memory vals = validatorSet.values();
    assertEq(vals.length, 2);
    assertEq(vals[0], address(1));
    assertEq(vals[1], address(3));

    // Values at epoch maintains historical values
    address[] memory valsAtEpoch = validatorSet.valuesAtTimestamp(ts - 1);
    assertEq(valsAtEpoch.length, 0);

    valsAtEpoch = validatorSet.valuesAtTimestamp(ts2 - 1);
    assertEq(valsAtEpoch.length, 3);
    assertEq(valsAtEpoch[0], address(1));
    assertEq(valsAtEpoch[1], address(2));
    assertEq(valsAtEpoch[2], address(3));

    valsAtEpoch = validatorSet.valuesAtTimestamp(ts3 - 1);
    assertEq(valsAtEpoch.length, 2);
    assertEq(valsAtEpoch[0], address(1));
    assertEq(valsAtEpoch[1], address(3));
  }
}
