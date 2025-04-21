// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {TimeCheater} from "../../staking/TimeCheater.sol";
import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";

contract AddressSnapshotAtTest is AddressSnapshotsBase {
  function test_WhenNoValidatorsAreRegistered(uint256 _index) public {
    // It reverts
    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, _index, 0)
    );
    validatorSet.at(_index);
  }

  function test_WhenIndexIsOutOfBounds(uint256 _index) public {
    validatorSet.add(address(1));

    vm.expectRevert(
      abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, _index, 0)
    );
    validatorSet.at(_index);
  }

  function test_WhenIndexIsValid(address[] memory _addrs) public {
    vm.assume(_addrs.length > 2);
    _addrs = boundUnique(_addrs);

    // it returns the current validator at that index
    timeCheater.cheat__setEpochNow(1);
    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.add(_addrs[i]);
    }

    for (uint256 i = 0; i < _addrs.length; i++) {
      vm.expectRevert(
        abi.encodeWithSelector(Errors.AddressSnapshotLib__IndexOutOfBounds.selector, i, 0)
      );
      validatorSet.at(i);
    }

    // it returns the correct validator after reordering
    timeCheater.cheat__setEpochNow(2);
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(validatorSet.at(i), _addrs[i]);
    }

    // Remove a random index
    // -1 to not remove the last item
    uint224 randomIndex = uint224(
      uint256(keccak256(abi.encodePacked(block.timestamp, _addrs.length))) % (_addrs.length - 1)
    );
    address removedAddr = _addrs[randomIndex];
    validatorSet.remove(randomIndex);

    // All still there
    for (uint256 i = 0; i < _addrs.length; i++) {
      assertEq(validatorSet.at(i), _addrs[i]);
    }

    // Progress in time, the deletion should take place
    timeCheater.cheat__setEpochNow(3);

    // The item at the random index should be different, as it has been replaced
    assertNotEq(validatorSet.at(randomIndex), removedAddr);
  }
}
