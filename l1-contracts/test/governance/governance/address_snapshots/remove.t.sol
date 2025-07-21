// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet,
  AddressSnapshotLib__IndexOutOfBounds
} from "@aztec/governance/libraries/AddressSnapshotLib.sol";
import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";

contract AddressSnapshotRemoveTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenAddressNotInTheSet() public {
    // It returns false
    assertFalse(validatorSet.remove(address(1)));
  }

  function test_WhenValidatorIsInTheSet(uint16 _add2) public {
    // It returns true
    // It decreases the length
    // It updates the snapshot for that index
    // It maintains historical values correctly

    uint32 ts = uint32(block.timestamp);
    uint32 ts2 = ts + uint32(bound(_add2, 1, 1000));

    validatorSet.add(address(1));
    assertEq(validatorSet.length(), 1);

    vm.warp(ts2);

    assertEq(validatorSet.length(), 1);

    assertTrue(validatorSet.remove(address(1)));
    assertEq(validatorSet.length(), 0);

    vm.expectRevert(abi.encodeWithSelector(AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0));
    validatorSet.getAddressFromIndexAtTimestamp(0, ts2);

    assertEq(validatorSet.getAddressFromIndexAtTimestamp(0, ts), address(1));
  }

  function test_WhenValidatorRemovingAnIndexLargerThanTheCurrentLength() public {
    // It reverts

    vm.expectRevert(abi.encodeWithSelector(AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0));
    validatorSet.remove(0);

    // Add some validators
    validatorSet.add(address(1));
    validatorSet.add(address(2));
    validatorSet.add(address(3));

    vm.expectRevert(abi.encodeWithSelector(AddressSnapshotLib__IndexOutOfBounds.selector, 10, 3));
    validatorSet.remove(10);
  }

  function test_WhenRemovingMultipleValidators(uint16 _add2, uint16 _add3) public {
    // It maintains correct order of remaining validators
    // It updates snapshots correctly for each removal

    uint32 ts = uint32(block.timestamp);
    uint32 ts2 = ts + uint32(bound(_add2, 1, 1000));
    uint32 ts3 = ts2 + uint32(bound(_add3, 1, 1000));

    validatorSet.add(address(1));
    validatorSet.add(address(2));
    validatorSet.add(address(3));

    address[] memory vals = validatorSet.values();
    assertEq(vals.length, 3);
    assertEq(vals[0], address(1));
    assertEq(vals[1], address(2));
    assertEq(vals[2], address(3));

    vm.warp(ts2);
    validatorSet.remove(address(2));

    vals = validatorSet.values();
    assertEq(vals.length, 2);
    assertEq(vals[0], address(1));
    assertEq(vals[1], address(3));

    vm.warp(ts3);
    validatorSet.remove(address(1));

    vals = validatorSet.values();
    assertEq(vals.length, 1);
    assertEq(vals[0], address(3));

    // Verify snapshots
    assertEq(validatorSet.getAddressFromIndexAtTimestamp(0, ts), address(1));
    assertEq(validatorSet.getAddressFromIndexAtTimestamp(1, ts), address(2));
    assertEq(validatorSet.getAddressFromIndexAtTimestamp(2, ts), address(3));

    assertEq(validatorSet.getAddressFromIndexAtTimestamp(0, ts2), address(1));
    assertEq(validatorSet.getAddressFromIndexAtTimestamp(1, ts2), address(3));

    assertEq(validatorSet.getAddressFromIndexAtTimestamp(0, ts3), address(3));

    vals = validatorSet.valuesAtTimestamp(ts);
    assertEq(vals.length, 3);
    assertEq(vals[0], address(1));
    assertEq(vals[1], address(2));
    assertEq(vals[2], address(3));

    vals = validatorSet.valuesAtTimestamp(ts2);
    assertEq(vals.length, 2);
    assertEq(vals[0], address(1));
    assertEq(vals[1], address(3));

    vals = validatorSet.valuesAtTimestamp(ts3);
    assertEq(vals.length, 1);
    assertEq(vals[0], address(3));
  }
}
