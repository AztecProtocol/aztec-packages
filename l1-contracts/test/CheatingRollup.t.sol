// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "./base/DecoderBase.sol";

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Signature} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {Math} from "@oz/utils/math/Math.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Rollup} from "./harnesses/Rollup.sol";
import {IRollupCore, BlockLog, SubmitEpochRootProofArgs} from "@aztec/core/interfaces/IRollup.sol";
import {FeeJuicePortal} from "@aztec/core/FeeJuicePortal.sol";
import {NaiveMerkle} from "./merkle/Naive.sol";
import {MerkleTestUtil} from "./merkle/TestUtil.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {
  ProposeArgs, OracleInput, ProposeLib
} from "@aztec/core/libraries/RollupLibs/ProposeLib.sol";

import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeLib
} from "@aztec/core/libraries/TimeLib.sol";

import {RollupBase, IInstance} from "./base/RollupBase.sol";

// solhint-disable comprehensive-interface

/**
 * Blocks are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 */
contract CheatingRollupTest is RollupBase {
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
      uint256 slotNumber = full.block.decodedHeader.globalVariables.slotNumber;
      uint256 initialTime =
        full.block.decodedHeader.globalVariables.timestamp - slotNumber * SLOT_DURATION;
      vm.warp(initialTime);
    }

    registry = new Registry(address(this));
    feeJuicePortal = new FeeJuicePortal(
      address(registry), address(testERC20), bytes32(Constants.FEE_JUICE_ADDRESS)
    );
    testERC20.mint(address(feeJuicePortal), Constants.FEE_JUICE_INITIAL_MINT);
    feeJuicePortal.initialize();
    rewardDistributor = new RewardDistributor(testERC20, registry, address(this));
    testERC20.mint(address(rewardDistributor), 1e6 ether);

    rollup = IInstance(
      address(
        new Rollup(
          feeJuicePortal,
          rewardDistributor,
          testERC20,
          bytes32(0),
          bytes32(0),
          bytes32(0),
          bytes32(0),
          address(this)
        )
      )
    );
    inbox = Inbox(address(rollup.INBOX()));
    outbox = Outbox(address(rollup.OUTBOX()));

    registry.upgrade(address(rollup));

    merkleTestUtil = new MerkleTestUtil();
    _;
  }

  function warpToL2Slot(uint256 _slot) public {
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(_slot))));
  }

  // BRUH, what is this stuff?
  function testBlocksWithAssumeProven() public setUpFor("mixed_block_1") {
    rollup.setAssumeProvenThroughBlockNumber(1);
    assertEq(rollup.getPendingBlockNumber(), 0, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");

    _proposeBlock("mixed_block_1", 1);
    _proposeBlock("mixed_block_2", 2);

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 1, "Invalid proven block number");
  }

  function testSetAssumeProvenAfterBlocksProcessed() public setUpFor("mixed_block_1") {
    assertEq(rollup.getPendingBlockNumber(), 0, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");

    _proposeBlock("mixed_block_1", 1);
    _proposeBlock("mixed_block_2", 2);
    rollup.setAssumeProvenThroughBlockNumber(1);

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 1, "Invalid proven block number");
  }
}
