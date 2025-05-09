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
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

contract GetAddressFromIndexAtTimestampTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;
  using SafeCast for uint256;

  function test_WhenNoValidatorsAreRegistered() public {
    // It throws out of bounds
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.getAddressFromIndexAtTimestamp(0, block.timestamp.toUint32());
  }

  modifier whenValidatorsExist(address[] memory _addrs) {
    _addrs = boundUnique(_addrs);

    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.add(_addrs[i]);
    }
    _;
  }

  function test_whenQueryingCurrentTimestamp(address[] memory _addrs)
    public
    whenValidatorsExist(_addrs)
  {
    _addrs = boundUnique(_addrs);

    // It should return the current validator address
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(
        validatorSet.getAddressFromIndexAtTimestamp(i, block.timestamp.toUint32()), _addrs[i]
      );
    }
  }

  function test_WhenQueryingFuture(address[] memory _addrs) public whenValidatorsExist(_addrs) {
    _addrs = boundUnique(_addrs);
    // It should return the current validator address
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(
        validatorSet.getAddressFromIndexAtTimestamp(i, (1000 + block.timestamp).toUint32()),
        _addrs[i]
      );
    }
  }

  function test_WhenQueryingPast(address[] memory _addrs, uint224 _index)
    public
    whenValidatorsExist(_addrs)
  {
    _addrs = boundUnique(_addrs);
    _index = uint224(bound(_index, 0, _addrs.length - 1));

    uint256 ts = block.timestamp;
    vm.warp(ts + 1000);

    // It should return the validator address from the snapshot
    assertEq(
      validatorSet.getAddressFromIndexAtTimestamp(
        _index, (block.timestamp - bound(_index, 1, 999)).toUint32()
      ),
      _addrs[_index]
    );

    // In a past epoch, it is out of bounds
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, _index, 0)
    );
    validatorSet.getAddressFromIndexAtTimestamp(_index, (ts - 1).toUint32());
  }

  function test_WhenValidatorWasRemoved(address[] memory _addrs) public whenValidatorsExist(_addrs) {
    _addrs = boundUnique(_addrs);

    uint224 lastIndex = uint224(_addrs.length - 1);
    address lastValidator = _addrs[lastIndex];

    uint256 ts = block.timestamp;
    vm.warp(ts + 1);

    assertEq(
      validatorSet.getAddressFromIndexAtTimestamp(lastIndex, (block.timestamp).toUint32()),
      lastValidator
    );

    validatorSet.remove(lastIndex);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.AddressSnapshotLib__IndexOutOfBounds.selector, lastIndex, lastIndex
      )
    );
    validatorSet.getAddressFromIndexAtTimestamp(lastIndex, (block.timestamp).toUint32());

    assertEq(validatorSet.getAddressFromIndexAtTimestamp(lastIndex, (ts).toUint32()), lastValidator);
  }

  function test_WhenIndexIsOutOfBounds(address[] memory _addrs) public whenValidatorsExist(_addrs) {
    // It should throw out of bounds
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.AddressSnapshotLib__IndexOutOfBounds.selector, _addrs.length, _addrs.length
      )
    );
    validatorSet.getAddressFromIndexAtTimestamp(_addrs.length, block.timestamp.toUint32());
  }

  function test_WhenValidatorIsRemovedAndNewOneAddedAtSamePosition(address[] memory _addrs)
    public
    whenValidatorsExist(_addrs)
  {
    vm.assume(_addrs.length > 2);
    // it maintains both current and historical values correctly

    uint32 t1 = block.timestamp.toUint32();

    // Random index to remove
    uint224 randomIndex = uint224(
      uint256(keccak256(abi.encodePacked(block.timestamp, _addrs.length))) % (_addrs.length - 1)
    );

    uint32 t2 = t1 + 1;
    vm.warp(t2);

    // Remove the validator
    validatorSet.remove(randomIndex);

    // Check it now contains the last validators
    assertEq(
      validatorSet.getAddressFromIndexAtTimestamp(randomIndex, t2), _addrs[_addrs.length - 1]
    );

    // Check it still contains the old validator at random index at t1
    assertEq(validatorSet.getAddressFromIndexAtTimestamp(randomIndex, t1), _addrs[randomIndex]);
  }
}
