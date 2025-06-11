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
  function test_WhenValidatorIsNotInTheSet(address _addr, uint16 _add2) public {
    // It returns true
    // It increases the length
    // It creates a checkpoint for the next epoch
    // It does not change the current epoch

    uint32 ts = uint32(block.timestamp);
    uint32 ts2 = ts + _add2;

    assertEq(validatorSet.lengthAtTimestamp(ts - 1), 0);
    assertEq(validatorSet.length(), 0);
    assertEq(validatorSet.lengthAtTimestamp(ts), 0);
    assertEq(validatorSet.lengthAtTimestamp(ts2), 0);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.getAddressFromIndexAtTimestamp(0, ts - 1);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.at(0);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.getAddressFromIndexAtTimestamp(0, ts);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.getAddressFromIndexAtTimestamp(0, ts2);

    assertTrue(validatorSet.add(_addr));

    assertEq(validatorSet.lengthAtTimestamp(ts - 1), 0);
    assertEq(validatorSet.length(), 1);
    assertEq(validatorSet.lengthAtTimestamp(ts), 1);
    assertEq(validatorSet.lengthAtTimestamp(ts2), 1);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.getAddressFromIndexAtTimestamp(0, ts - 1);

    assertEq(validatorSet.at(0), _addr);
    assertEq(validatorSet.getAddressFromIndexAtTimestamp(0, ts), _addr);
    assertEq(validatorSet.getAddressFromIndexAtTimestamp(0, ts2), _addr);

    vm.warp(ts2);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.getAddressFromIndexAtTimestamp(0, ts - 1);
    assertEq(validatorSet.at(0), _addr);
    assertEq(validatorSet.getAddressFromIndexAtTimestamp(0, ts), _addr);
    assertEq(validatorSet.getAddressFromIndexAtTimestamp(0, ts2), _addr);
  }

  function test_WhenValidatorIsAlreadyInTheSet(address _addr) public {
    // It returns false

    validatorSet.add(_addr);

    // Addition should fail, and no writes should be made
    vm.record();
    assertFalse(validatorSet.add(_addr));

    (, bytes32[] memory writes) = vm.accesses(address(validatorSet));
    assertEq(writes.length, 0);
  }

  function test_WhenValidatorHasBeenRemovedFromTheSet(
    address[] memory _addrs,
    uint16 _add2,
    uint16 _add3
  ) public {
    // It can be added again

    _addrs = boundUnique(_addrs);

    uint32 ts = uint32(block.timestamp);
    uint32 ts2 = ts + uint32(bound(_add2, 1, 1000));
    uint32 ts3 = ts2 + uint32(bound(_add3, 1, 1000));

    // Add all of the addresses
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertTrue(validatorSet.add(_addrs[i]));
    }

    for (uint256 i = 0; i < _addrs.length; i++) {
      vm.expectRevert(
        abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, i, 0)
      );
      validatorSet.getAddressFromIndexAtTimestamp(i, ts - 1);

      // For the current time we should see the values
      assertEq(validatorSet.at(i), _addrs[i]);
      assertEq(validatorSet.getAddressFromIndexAtTimestamp(i, ts), _addrs[i]);
      assertEq(validatorSet.getAddressFromIndexAtTimestamp(i, ts2), _addrs[i]);
      assertEq(validatorSet.getAddressFromIndexAtTimestamp(i, ts3), _addrs[i]);
    }

    vm.warp(ts2);

    // Remove all of the addresses
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertTrue(validatorSet.remove(_addrs[i]));
    }

    // Addresses should now remain during the current epoch after removal
    for (uint256 i = 0; i < _addrs.length; i++) {
      vm.expectRevert(
        abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, i, 0)
      );
      validatorSet.at(i);
      vm.expectRevert(
        abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, i, 0)
      );
      validatorSet.getAddressFromIndexAtTimestamp(i, ts2);

      vm.expectRevert(
        abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, i, 0)
      );
      validatorSet.getAddressFromIndexAtTimestamp(i, ts3);

      assertEq(validatorSet.getAddressFromIndexAtTimestamp(i, ts), _addrs[i]);
    }

    vm.warp(ts3);

    // Add all of the addresses again
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertTrue(validatorSet.add(_addrs[i]));
    }

    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(validatorSet.getAddressFromIndexAtTimestamp(i, ts), _addrs[i]);
      vm.expectRevert(
        abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, i, 0)
      );
      validatorSet.getAddressFromIndexAtTimestamp(i, ts2);

      assertEq(validatorSet.getAddressFromIndexAtTimestamp(i, ts3), _addrs[i]);
      assertEq(validatorSet.at(i), _addrs[i]);
    }
  }
}
