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
import {Rollup} from "@aztec/core/Rollup.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";

import {
  IRollup,
  IRollupCore,
  BlockLog,
  SubmitEpochRootProofArgs,
  EthValue,
  FeeAssetValue,
  FeeAssetPerEthE9,
  PublicInputArgs
} from "@aztec/core/interfaces/IRollup.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {NaiveMerkle} from "./merkle/Naive.sol";
import {MerkleTestUtil} from "./merkle/TestUtil.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {ProposeArgs, OracleInput, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {IERC20} from "@oz/token/ERC20/IERC20.sol";
import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeLib
} from "@aztec/core/libraries/TimeLib.sol";

import {ValidatorSelectionTestBase} from "./validator-selection/ValidatorSelectionBase.sol";

/**
 * Testing the things that should be getters are not updating state!
 * Look at the `rollup.sol` with \)\s*(?:external|public)(?!\s*(?:\r?\n\s*)*(?:view|pure)\b)
 * to find the functions that should be getters. Things that are in there should be getters only.
 *
 * We have to look a bit into the `RollupCore.sol` to make sure that we are not missing anything.
 */
contract RollupShouldBeGetters is ValidatorSelectionTestBase {
  function test_getEpochCommittee(uint16 _epochToGet, bool _setup) external setup(4) {
    uint256 expectedSize = _epochToGet < 2 ? 0 : 4;
    Epoch e = Epoch.wrap(_epochToGet);
    Timestamp t = timeCheater.epochToTimestamp(e);

    vm.warp(Timestamp.unwrap(t));

    if (_setup) {
      rollup.setupEpoch();
    }

    vm.record();

    address[] memory committee = rollup.getEpochCommittee(e);
    address[] memory committee2 = rollup.getCommitteeAt(t);
    address[] memory committee3 = rollup.getCurrentEpochCommittee();
    assertEq(committee.length, expectedSize, "invalid getEpochCommittee");
    assertEq(committee2.length, expectedSize, "invalid getCommitteeAt");
    assertEq(committee3.length, expectedSize, "invalid getCurrentEpochCommittee");

    (, bytes32[] memory writes) = vm.accesses(address(rollup));
    assertEq(writes.length, 0, "No writes should be done");
  }

  function test_getEpochCommitteeBig(uint16 _epochToGet, bool _setup) external setup(49) {
    uint256 expectedSize = _epochToGet < 2 ? 0 : 48;
    Epoch e = Epoch.wrap(_epochToGet);
    Timestamp t = timeCheater.epochToTimestamp(e);

    vm.warp(Timestamp.unwrap(t));

    if (_setup) {
      rollup.setupEpoch();
    }

    vm.record();

    address[] memory committee = rollup.getEpochCommittee(e);
    address[] memory committee2 = rollup.getCommitteeAt(t);
    address[] memory committee3 = rollup.getCurrentEpochCommittee();
    assertEq(committee.length, expectedSize, "invalid getEpochCommittee");
    assertEq(committee2.length, expectedSize, "invalid getCommitteeAt");
    assertEq(committee3.length, expectedSize, "invalid getCurrentEpochCommittee");

    (, bytes32[] memory writes) = vm.accesses(address(rollup));
    assertEq(writes.length, 0, "No writes should be done");
  }

  function test_getProposerAt(uint16 _slot, bool _setup) external setup(4) {
    Slot s = Slot.wrap(_slot);
    Timestamp t = timeCheater.slotToTimestamp(s);

    vm.warp(Timestamp.unwrap(t));

    if (_setup) {
      rollup.setupEpoch();
    }

    vm.record();

    address proposer = rollup.getProposerAt(t);
    address proposer2 = rollup.getCurrentProposer();

    assertEq(proposer, proposer2, "proposer should be the same");

    (, bytes32[] memory writes) = vm.accesses(address(rollup));
    assertEq(writes.length, 0, "No writes should be done");
  }

  function test_validateHeader() external setup(4) {
    // Todo this one is a bit annoying here really. We need a lot of header information.
  }

  function test_canProposeAtTime(uint16 _timestamp, bool _setup) external setup(1) {
    timeCheater.cheat__progressEpoch();

    Timestamp t = Timestamp.wrap(block.timestamp + _timestamp);

    vm.warp(Timestamp.unwrap(t));

    if (_setup) {
      rollup.setupEpoch();
    }

    address proposer = rollup.getCurrentProposer();

    BlockLog memory log = rollup.getBlock(rollup.getPendingBlockNumber());

    vm.record();

    vm.prank(proposer);
    rollup.canProposeAtTime(t, log.archive);

    (, bytes32[] memory writes) = vm.accesses(address(rollup));
    assertEq(writes.length, 0, "No writes should be done");
  }
}
