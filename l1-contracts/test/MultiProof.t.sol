// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "./base/DecoderBase.sol";

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {FeeJuicePortal} from "@aztec/core/FeeJuicePortal.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {ProposeArgs, ProposeLib} from "@aztec/core/libraries/RollupLibs/ProposeLib.sol";

import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeLib
} from "@aztec/core/libraries/TimeLib.sol";

import {Rollup, Config} from "@aztec/core/Rollup.sol";
import {Strings} from "@oz/utils/Strings.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";

import {RollupBase, IInstance} from "./base/RollupBase.sol";

// solhint-disable comprehensive-interface

/**
 * Blocks are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 */
contract MultiProofTest is RollupBase {
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
          address(this),
          Config({
            aztecSlotDuration: TestConstants.AZTEC_SLOT_DURATION,
            aztecEpochDuration: TestConstants.AZTEC_EPOCH_DURATION,
            targetCommitteeSize: TestConstants.AZTEC_TARGET_COMMITTEE_SIZE,
            aztecProofSubmissionWindow: TestConstants.AZTEC_PROOF_SUBMISSION_WINDOW,
            minimumStake: TestConstants.AZTEC_MINIMUM_STAKE,
            slashingQuorum: TestConstants.AZTEC_SLASHING_QUORUM,
            slashingRoundSize: TestConstants.AZTEC_SLASHING_ROUND_SIZE
          })
        )
      )
    );

    registry.upgrade(address(rollup));

    _;
  }

  function warpToL2Slot(uint256 _slot) public {
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(_slot))));
  }

  function logStatus() public {
    uint256 provenBlockNumber = rollup.getProvenBlockNumber();
    uint256 pendingBlockNumber = rollup.getPendingBlockNumber();
    emit log_named_uint("proven block number", provenBlockNumber);
    emit log_named_uint("pending block number", pendingBlockNumber);

    address[2] memory provers = [address(bytes20("lasse")), address(bytes20("mitch"))];
    address sequencer = address(bytes20("sequencer"));

    emit log_named_decimal_uint("sequencer rewards", rollup.getSequencerRewards(sequencer), 18);
    emit log_named_decimal_uint(
      "prover rewards", rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(0)), 18
    );

    for (uint256 i = 0; i < provers.length; i++) {
      for (uint256 j = 1; j <= provenBlockNumber; j++) {
        bool hasSubmitted = rollup.getHasSubmitted(Epoch.wrap(0), j, provers[i]);
        if (hasSubmitted) {
          emit log_named_string(
            string.concat("prover has submitted proof up till block ", Strings.toString(j)),
            string(abi.encode(provers[i]))
          );
        }
      }
      emit log_named_decimal_uint(
        string.concat("prover ", string(abi.encode(provers[i])), " rewards"),
        rollup.getSpecificProverRewardsForEpoch(Epoch.wrap(0), provers[i]),
        18
      );
    }
  }

  function testMultiProof() public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 1, 15e6);
    _proposeBlock("mixed_block_2", 2, 15e6);

    assertEq(rollup.getProvenBlockNumber(), 0, "Block already proven");

    string memory name = "mixed_block_";
    _proveBlocks(name, 1, 1, address(bytes20("lasse")));
    _proveBlocks(name, 1, 1, address(bytes20("mitch")));
    _proveBlocks(name, 1, 2, address(bytes20("mitch")));

    logStatus();

    assertEq(rollup.getProvenBlockNumber(), 2, "Block not proven");
  }

  function testNoHolesInProvenBlocks() public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 1, 15e6);
    _proposeBlock("mixed_block_2", TestConstants.AZTEC_EPOCH_DURATION + 1, 15e6);

    string memory name = "mixed_block_";
    _proveBlocksFail(
      name,
      2,
      2,
      address(bytes20("lasse")),
      abi.encodeWithSelector(Errors.Rollup__StartIsNotBuildingOnProven.selector)
    );
  }

  function testProofsAreInOneEpoch() public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 1, 15e6);
    _proposeBlock("mixed_block_2", TestConstants.AZTEC_EPOCH_DURATION + 1, 15e6);

    string memory name = "mixed_block_";
    _proveBlocksFail(
      name,
      1,
      2,
      address(bytes20("lasse")),
      abi.encodeWithSelector(Errors.Rollup__StartAndEndNotSameEpoch.selector, 0, 1)
    );
  }
}
