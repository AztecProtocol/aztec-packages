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

contract GetAddressFromIndexAtEpochTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenNoValidatorsAreRegistered() public {
    // It throws out of bounds
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, 0, 0)
    );
    validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(0));
  }

  modifier whenValidatorsExist(address[] memory _addrs) {
    _addrs = boundUnique(_addrs);

    timeCheater.cheat__setEpochNow(1);
    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.add(_addrs[i]);
    }
    timeCheater.cheat__setEpochNow(2);
    _;
  }

  function test_whenQueryingCurrentEpoch(address[] memory _addrs)
    public
    whenValidatorsExist(_addrs)
  {
    _addrs = boundUnique(_addrs);

    // It should return the current validator address
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(validatorSet.getAddressFromIndexAtEpoch(i, Epoch.wrap(2)), _addrs[i]);
    }
  }

  function test_WhenValidatorsExist_WhenQueryingFutureEpoch(address[] memory _addrs)
    public
    whenValidatorsExist(_addrs)
  {
    _addrs = boundUnique(_addrs);
    // It should return the current validator address
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(validatorSet.getAddressFromIndexAtEpoch(i, Epoch.wrap(3)), _addrs[i]);
    }
  }

  function test_WhenValidatorsExist_WhenQueryingPastEpoch(address[] memory _addrs, uint224 _index)
    public
    whenValidatorsExist(_addrs)
  {
    _addrs = boundUnique(_addrs);
    _index = uint224(bound(_index, 0, _addrs.length - 1));

    // It should return the validator address from the snapshot
    assertEq(validatorSet.getAddressFromIndexAtEpoch(_index, Epoch.wrap(2)), _addrs[_index]);

    // In a past epoch, it is out of bounds
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, _index, 0)
    );
    validatorSet.getAddressFromIndexAtEpoch(_index, Epoch.wrap(1));
  }

  function test_WhenValidatorWasRemoved(address[] memory _addrs) public whenValidatorsExist(_addrs) {
    _addrs = boundUnique(_addrs);
    // It should not remove until the next epoch

    uint224 lastIndex = uint224(_addrs.length - 1);
    address lastValidator = _addrs[lastIndex];

    validatorSet.remove(lastIndex);
    assertEq(validatorSet.getAddressFromIndexAtEpoch(lastIndex, Epoch.wrap(2)), lastValidator);

    timeCheater.cheat__setEpochNow(3);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.AddressSnapshotLib__IndexOutOfBounds.selector, lastIndex, lastIndex
      )
    );
    validatorSet.getAddressFromIndexAtEpoch(lastIndex, Epoch.wrap(3));
  }

  function test_WhenIndexIsOutOfBounds(address[] memory _addrs) public whenValidatorsExist(_addrs) {
    // It should throw out of bounds
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, _addrs.length, 0)
    );
    validatorSet.getAddressFromIndexAtEpoch(_addrs.length, Epoch.wrap(1));
  }

  function test_WhenValidatorIsRemovedAndNewOneAddedAtSamePosition(address[] memory _addrs)
    public
    whenValidatorsExist(_addrs)
  {
    vm.assume(_addrs.length > 2);
    // it maintains both current and historical values correctly

    // Random index to remove
    uint224 randomIndex = uint224(
      uint256(keccak256(abi.encodePacked(block.timestamp, _addrs.length))) % (_addrs.length - 1)
    );

    // Remove the validator
    validatorSet.remove(randomIndex);

    timeCheater.cheat__setEpochNow(3);

    // In epoch 3, there should be a different validator at random index, as it has been replaced with the last validator
    // But we should still be able to query the old validator at random index in epoch 2

    // Check it now contains the last validators
    assertEq(
      validatorSet.getAddressFromIndexAtEpoch(randomIndex, Epoch.wrap(3)), _addrs[_addrs.length - 1]
    );

    // Check it still contains the old validator at random index in epoch 2
    assertEq(
      validatorSet.getAddressFromIndexAtEpoch(randomIndex, Epoch.wrap(2)), _addrs[randomIndex]
    );
  }
}
