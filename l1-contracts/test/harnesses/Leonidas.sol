// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Leonidas as RealLeonidas} from "@aztec/core/Leonidas.sol";
import {TestConstants} from "./TestConstants.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

contract Leonidas is RealLeonidas {
  constructor(address _ares)
    RealLeonidas(
      _ares,
      new TestERC20("test", "TEST", address(this)),
      100e18,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_TARGET_COMMITTEE_SIZE
    )
  {}
}
