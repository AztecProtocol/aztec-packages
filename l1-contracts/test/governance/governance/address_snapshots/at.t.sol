// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet,
  AddressSnapshotLib__IndexOutOfBounds
} from "@aztec/governance/libraries/AddressSnapshotLib.sol";
import {TimeCheater} from "test/staking/TimeCheater.sol";
import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

contract AddressSnapshotAtTest is AddressSnapshotsBase {
  using SafeCast for uint256;

  function test_WhenNoValidatorsAreRegistered(uint256 _index) public {
    // It reverts
    vm.expectRevert(
      abi.encodeWithSelector(AddressSnapshotLib__IndexOutOfBounds.selector, _index, 0)
    );
    validatorSet.at(_index);
  }

  function test_WhenIndexIsOutOfBounds(uint256 _index) public {
    vm.assume(_index >= 1);
    validatorSet.add(address(1));
    vm.expectRevert(
      abi.encodeWithSelector(AddressSnapshotLib__IndexOutOfBounds.selector, _index, 1)
    );
    validatorSet.at(_index);

    vm.expectRevert(
      abi.encodeWithSelector(AddressSnapshotLib__IndexOutOfBounds.selector, _index, 1)
    );
    validatorSet.getAddressFromIndexAtTimestamp(_index, block.timestamp.toUint32());
  }

  function test_WhenIndexIsValid(address[] memory _addrs) public {
    vm.assume(_addrs.length > 2);
    _addrs = boundUnique(_addrs);

    // it returns the current validator at that index
    timeCheater.cheat__setEpochNow(1);
    for (uint256 i = 0; i < _addrs.length; i++) {
      validatorSet.add(_addrs[i]);
      assertEq(validatorSet.at(i), _addrs[i]);
      assertEq(
        validatorSet.getAddressFromIndexAtTimestamp(i, block.timestamp.toUint32()), _addrs[i]
      );
    }

    address last = validatorSet.at(_addrs.length - 1);

    // Remove a random index
    // -1 to not remove the last item
    uint224 randomIndex = uint224(
      uint256(keccak256(abi.encodePacked(block.timestamp, _addrs.length))) % (_addrs.length - 1)
    );
    address removedAddr = _addrs[randomIndex];
    validatorSet.remove(randomIndex);

    // The item at the random index should be different, as it has been replaced
    assertNotEq(validatorSet.at(randomIndex), removedAddr);
    assertEq(validatorSet.at(randomIndex), last);
    assertEq(
      validatorSet.getAddressFromIndexAtTimestamp(randomIndex, block.timestamp.toUint32()), last
    );
  }
}
