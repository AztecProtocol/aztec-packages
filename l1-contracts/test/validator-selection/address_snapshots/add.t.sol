// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";
import {AddressSnapshotLib, SnapshottedAddressSet} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

contract AddTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenValidatorIsNotInTheSet() public {
    timeCheater.cheat__setEpochNow(1);
    assertTrue(validatorSet.add(address(1)));
    assertEq(validatorSet.length(), 1);
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(1)), address(1));
  }

  function test_WhenValidatorIsAlreadyInTheSet() public {
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    assertFalse(validatorSet.add(address(1)));
  }
}
