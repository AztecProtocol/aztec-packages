// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {AddressSnapshotsBase} from "./AddressSnapshotsBase.t.sol";
import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";
import {Epoch} from "@aztec/core/libraries/TimeLib.sol";

contract GetAddressFromIndexAtEpochTest is AddressSnapshotsBase {
  using AddressSnapshotLib for SnapshottedAddressSet;

  function test_WhenNoValidatorsAreRegistered() public view {
    // It should return address(0)
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(0)), address(0));
  }

  modifier whenValidatorsExist() {
    timeCheater.cheat__setEpochNow(1);
    validatorSet.add(address(1));
    _;
  }

  function test_WhenValidatorsExist_WhenQueryingCurrentEpoch() public whenValidatorsExist {
    // It should return the current validator address
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(1)), address(1));
  }

  function test_WhenValidatorsExist_WhenQueryingFutureEpoch() public whenValidatorsExist {
    // It should return the current validator address
    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(2)), address(1));
  }

  function test_WhenValidatorsExist_WhenQueryingPastEpoch() public whenValidatorsExist {
    // It should return the validator address from the snapshot
    timeCheater.cheat__setEpochNow(2);
    validatorSet.add(address(2));

    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(1)), address(1));
  }

  function test_WhenValidatorsExist_WhenValidatorWasRemoved() public whenValidatorsExist {
    // It should return address(0)

    timeCheater.cheat__setEpochNow(2);
    validatorSet.remove(0);

    assertEq(validatorSet.getAddressFromIndexAtEpoch(0, Epoch.wrap(2)), address(0));
  }

  function test_WhenIndexIsOutOfBounds() public whenValidatorsExist {
    // It should return address(0)
    assertEq(validatorSet.getAddressFromIndexAtEpoch(1, Epoch.wrap(1)), address(0));
  }

  function test_WhenValidatorIsRemovedAndNewOneAddedAtSamePosition() public whenValidatorsExist {
    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(1)), address(1));

    // Remove index 0 from the set, in the new epoch
    timeCheater.cheat__setEpochNow(2);

    validatorSet.remove( /* index */ 0);

    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(2)), address(0));

    // Add validator 2 to the first index in the set
    timeCheater.cheat__setEpochNow(3);

    validatorSet.add(address(2));
    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(3)), address(2));

    // Setup and remove the last item in the set alot of times
    timeCheater.cheat__setEpochNow(4);
    validatorSet.remove( /* index */ 0);

    timeCheater.cheat__setEpochNow(5);
    validatorSet.add(address(3));
    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(5)), address(3));

    timeCheater.cheat__setEpochNow(6);
    validatorSet.remove( /* index */ 0);

    timeCheater.cheat__setEpochNow(7);
    validatorSet.add(address(4));
    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(7)), address(4));

    // Expect past values to be maintained
    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(1)), address(1));
    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(2)), address(0));
    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(3)), address(2));
    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(4)), address(0));
    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(5)), address(3));
    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(6)), address(0));
    assertEq(validatorSet.getAddressFromIndexAtEpoch( /* index */ 0, Epoch.wrap(7)), address(4));
  }
}
