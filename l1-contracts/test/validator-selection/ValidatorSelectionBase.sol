// SPDX-License-Identifier: Apache-2.0
// Copyright 2025 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";

import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";

import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Registry} from "@aztec/governance/Registry.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {MerkleTestUtil} from "../merkle/TestUtil.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {MessageHashUtils} from "@oz/utils/cryptography/MessageHashUtils.sol";
import {TestConstants} from "../harnesses/TestConstants.sol";

import {Epoch, Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {SlashFactory} from "@aztec/periphery/SlashFactory.sol";
import {Slasher} from "@aztec/core/slashing/Slasher.sol";
import {IValidatorSelection} from "@aztec/core/interfaces/IValidatorSelection.sol";
import {ProposePayload} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {MultiAdder, CheatDepositArgs} from "@aztec/mock/MultiAdder.sol";
import {RollupBuilder} from "../builder/RollupBuilder.sol";
import {Slot} from "@aztec/core/libraries/TimeLib.sol";

import {TimeCheater} from "../staking/TimeCheater.sol";
import {stdStorage, StdStorage} from "forge-std/Test.sol";
// solhint-disable comprehensive-interface

/**
 * We are using the same blocks as from Rollup.t.sol.
 * The tests in this file is testing the sequencer selection
 */
contract ValidatorSelectionTestBase is DecoderBase {
  using MessageHashUtils for bytes32;
  using stdStorage for StdStorage;

  struct StructToAvoidDeepStacks {
    uint256 needed;
    address proposer;
    bool shouldRevert;
    bool provideEmptyAttestations;
    uint256 attestationsCount;
    ProposePayload proposePayload;
  }

  SlashFactory internal slashFactory;
  Slasher internal slasher;
  Inbox internal inbox;
  Outbox internal outbox;
  Rollup internal rollup;
  MerkleTestUtil internal merkleTestUtil;
  TestERC20 internal testERC20;
  RewardDistributor internal rewardDistributor;
  Signature internal emptySignature;
  TimeCheater internal timeCheater;
  mapping(address attester => uint256 privateKey) internal attesterPrivateKeys;
  mapping(address => bool) internal _seenValidators;
  mapping(address => bool) internal _seenCommittee;

  /**
   * @notice Setup contracts needed for the tests with the a given number of validators
   */
  modifier setup(uint256 _validatorCount, uint256 _targetCommitteeSize) {
    string memory _name = "mixed_block_1";
    {
      DecoderBase.Full memory full = load(_name);
      Slot slotNumber = full.block.header.slotNumber;
      uint256 initialTime = Timestamp.unwrap(full.block.header.timestamp)
        - Slot.unwrap(slotNumber) * TestConstants.AZTEC_SLOT_DURATION;

      timeCheater = new TimeCheater(
        address(rollup),
        initialTime,
        TestConstants.AZTEC_SLOT_DURATION,
        TestConstants.AZTEC_EPOCH_DURATION
      );
      vm.warp(initialTime);
    }

    CheatDepositArgs[] memory initialValidators = new CheatDepositArgs[](_validatorCount);

    for (uint256 i = 1; i < _validatorCount + 1; i++) {
      initialValidators[i - 1] = createDepositArgs(i);
    }

    RollupBuilder builder = new RollupBuilder(address(this)).setEntryQueueFlushSizeMin(
      _validatorCount
    ).setValidators(initialValidators).setTargetCommitteeSize(_targetCommitteeSize);
    builder.deploy();

    rollup = builder.getConfig().rollup;
    rewardDistributor = builder.getConfig().rewardDistributor;
    testERC20 = builder.getConfig().testERC20;
    slasher = Slasher(rollup.getSlasher());
    slashFactory = new SlashFactory(IValidatorSelection(address(rollup)));

    inbox = Inbox(address(rollup.getInbox()));
    outbox = Outbox(address(rollup.getOutbox()));

    merkleTestUtil = new MerkleTestUtil();
    _;
  }

  modifier progressEpochs(uint256 _epochCount) {
    // Progress into the next epoch for changes to take effect
    for (uint256 i = 0; i < _epochCount; i++) {
      timeCheater.cheat__progressEpoch();
    }
    _;
  }

  function createDepositArgs(uint256 _keySalt) internal returns (CheatDepositArgs memory) {
    uint256 attesterPrivateKey = uint256(keccak256(abi.encode("attester", _keySalt)));
    address attester = vm.addr(attesterPrivateKey);
    attesterPrivateKeys[attester] = attesterPrivateKey;

    return CheatDepositArgs({attester: attester, withdrawer: address(this)});
  }
}
