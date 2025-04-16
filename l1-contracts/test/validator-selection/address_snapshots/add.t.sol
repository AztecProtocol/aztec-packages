// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";
import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

contract AddressSnapshotAddTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenValidatorIsNotInTheSet() public {
    // It returns true
    // It increases the length
    // It creates a checkpoint for the next epoch
    // It does not change the current epoch

    timeCheater.cheat__setEpochNow(1);
    assertTrue(validatorSet.add(address(1)));
    assertEq(validatorSet.length(), 0);

    timeCheater.cheat__setEpochNow(2);
    assertEq(validatorSet.length(), 1);

    // Epoch 0 remains frozen, so this number should not update
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(1)), address(0));
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(2)), address(1));
  }

  function test_WhenValidatorIsAlreadyInTheSet() public {
    // It returns false

    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    assertFalse(validatorSet.add(address(1)));
  }
}
