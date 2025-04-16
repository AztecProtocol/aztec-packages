// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {
  AddressSnapshotLib,
  SnapshottedAddressSet
} from "@aztec/core/libraries/staking/AddressSnapshotLib.sol";

import {Test} from "forge-std/Test.sol";
import {TimeLib, TimeStorage, Epoch} from "@aztec/core/libraries/TimeLib.sol";
import {TimeCheater} from "../../staking/TimeCheater.sol";
import {TestConstants} from "../../harnesses/TestConstants.sol";

contract AddressSnapshotsBase is Test {
  using AddressSnapshotLib for SnapshottedAddressSet;

  uint256 private constant SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
  uint256 private constant EPOCH_DURATION = TestConstants.AZTEC_EPOCH_DURATION;
  uint256 private immutable GENESIS_TIME = block.timestamp;

  SnapshottedAddressSet validatorSet;
  TimeCheater timeCheater;

  function setUp() public {
    timeCheater = new TimeCheater(address(this), GENESIS_TIME, SLOT_DURATION, EPOCH_DURATION);
  }
}
