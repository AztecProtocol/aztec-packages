// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";
import {AddressSnapshotLib, SnapshottedAddressSet} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

contract GetAddressFromIndexAtEpochTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenNoValidatorsAreRegistered() view public {
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(0)), address(0));
  }

  function test_WhenValidatorsExist_WhenQueryingCurrentEpoch() public {
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(1)), address(1));
  }

  function test_WhenValidatorsExist_WhenQueryingPastEpoch() public {
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));

    timeCheater.cheat__setEpochNow(2);
    validatorSet.add(address(2));

    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(1)), address(1));
  }

  function test_WhenValidatorsExist_WhenValidatorWasRemoved() public {
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));

    timeCheater.cheat__setEpochNow(2);
    validatorSet.remove(0);

    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(2)), address(0));
  }

  function test_WhenIndexIsOutOfBounds() public {
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));

    assertEq(validatorSet.getAddressFromIndexAtEpoch(1, Epoch.wrap(1)), address(0));
  }
}
