// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";
import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

contract AddressSnapshotAddTest is AddressSnapshotsBase {
  function test_WhenValidatorIsNotInTheSet(address _addr) public {
    // It returns true
    // It increases the length
    // It creates a checkpoint for the next epoch
    // It does not change the current epoch

    timeCheater.cheat__setEpochNow(1);
    assertTrue(validatorSet.add(_addr));
    assertEq(validatorSet.length(), 0);

    timeCheater.cheat__setEpochNow(2);
    assertEq(validatorSet.length(), 1);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(1));

    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(2)), _addr);
  }

  function test_WhenValidatorIsAlreadyInTheSet(address _addr) public {
    // It returns false

    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(_addr);

    // Addition should fail, and no writes should be made
    vm.record();
    assertFalse(validatorSet.add(_addr));

    (, bytes32[] memory writes) = vm.accesses(address(validatorSet));
    assertEq(writes.length, 0);
  }

  function test_WhenValidatorHasBeenRemovedFromTheSet(address[] memory _addrs) public {
    // It can be added again

    _addrs = boundUnique(_addrs);

    timeCheater.cheat__setEpochNow(1);

    // Add all of the addresses
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertTrue(validatorSet.add(_addrs[i]));
    }

    // Addresses should be empty for the current epoch
    for (uint256 i = 0; i < _addrs.length; i++) {
      vm.expectRevert(
        abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, i, 0)
      );
      validatorSet.getAddressFromIndexAtEpoch(i, Epoch.wrap(1));
    }

    timeCheater.cheat__setEpochNow(2);
    // Addresses should now be added
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(validatorSet.getAddressFromIndexAtEpoch(i, Epoch.wrap(2)), _addrs[i]);
    }

    // Remove all of the addresses
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertTrue(validatorSet.remove(_addrs[i]));
    }

    // Addresses should now remain during the current epoch after removal
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(validatorSet.getAddressFromIndexAtEpoch(i, Epoch.wrap(2)), _addrs[i]);
    }

    timeCheater.cheat__setEpochNow(3);
    for (uint256 i = 0; i < _addrs.length; i++) {
      vm.expectRevert(
        abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, i, 0)
      );
      validatorSet.getAddressFromIndexAtEpoch(i, Epoch.wrap(1));
    }

    // Add all of the addresses again
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertTrue(validatorSet.add(_addrs[i]));
    }

    timeCheater.cheat__setEpochNow(4);
    // Assert both sets are in the set
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(validatorSet.getAddressFromIndexAtEpoch(i, Epoch.wrap(4)), _addrs[i]);
    }
  }
}
