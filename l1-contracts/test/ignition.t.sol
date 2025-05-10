// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "./base/DecoderBase.sol";

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {ProposeArgs, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";

import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeLib
} from "@aztec/core/libraries/TimeLib.sol";

import {Rollup} from "@aztec/core/Rollup.sol";
import {Strings} from "@oz/utils/Strings.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

import {RollupBase, IInstance} from "./base/RollupBase.sol";
import {IRollup, RollupConfigInput} from "@aztec/core/interfaces/IRollup.sol";

// solhint-disable comprehensive-interface

/**
 * Blocks are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 */
contract IgnitionTest is RollupBase {
  using SlotLib for Slot;
  using EpochLib for Epoch;
  using ProposeLib for ProposeArgs;
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;

  Registry internal registry;
  TestERC20 internal testERC20;
  FeeJuicePortal internal feeJuicePortal;
  RewardDistributor internal rewardDistributor;

  uint256 internal SLOT_DURATION;
  uint256 internal EPOCH_DURATION;

  address internal sequencer = address(bytes20("sequencer"));

  constructor() {
    TimeLib.initialize(
      block.timestamp, TestConstants.AZTEC_SLOT_DURATION, TestConstants.AZTEC_EPOCH_DURATION
    );
    SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
    EPOCH_DURATION = TestConstants.AZTEC_EPOCH_DURATION;
  }

  /**
   * @notice  Set up the contracts needed for the tests with time aligned to the provided block name
   */
  modifier setUpFor(string memory _name) {
    {
      testERC20 = new TestERC20("test", "TEST", address(this));

      DecoderBase.Full memory full = load(_name);
      Slot slotNumber = full.block.header.slotNumber;
      uint256 initialTime =
        Timestamp.unwrap(full.block.header.timestamp) - Slot.unwrap(slotNumber) * SLOT_DURATION;
      vm.warp(initialTime);
    }

    registry = new Registry(address(this), testERC20);

    RollupConfigInput memory rollupConfigInput = TestConstants.getRollupConfigInput();

    /* -------------------------------------------------------------------------- */
    /*                          SET MANA TARGET TO 0!                             */
    /* -------------------------------------------------------------------------- */
    rollupConfigInput.manaTarget = 0;

    rollup = IInstance(
      address(
        new Rollup(
          testERC20,
          rewardDistributor,
          testERC20,
          address(this),
          TestConstants.getGenesisState(),
          rollupConfigInput
        )
      )
    );

    feeJuicePortal = FeeJuicePortal(address(rollup.getFeeAssetPortal()));
    rewardDistributor = RewardDistributor(address(registry.getRewardDistributor()));
    testERC20.mint(address(rewardDistributor), 1e6 ether);

    registry.addRollup(IRollup(address(rollup)));

    _;
  }

  function test_emptyBlock() public setUpFor("empty_block_1") {
    _proposeBlock("empty_block_1", 1, 0);
  }

  function test_RevertNonEmptyBlock() public setUpFor("empty_block_1") {
    _proposeBlockFail(
      "empty_block_1", 1, 1, abi.encodeWithSelector(Errors.Rollup__ManaLimitExceeded.selector)
    );
  }
}
