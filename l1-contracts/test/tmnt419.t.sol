// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "./base/DecoderBase.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {ProposeArgs, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";

import {Timestamp, Slot, Epoch, TimeLib} from "@aztec/core/libraries/TimeLib.sol";

import {Errors} from "@aztec/core/libraries/Errors.sol";
import {ProposeArgs, ProposePayload, OracleInput, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";

import {RollupBase, IInstance} from "./base/RollupBase.sol";
import {RollupBuilder} from "./builder/RollupBuilder.sol";
import {TimeCheater} from "./staking/TimeCheater.sol";
import {Bps, BpsLib} from "@aztec/core/libraries/rollup/RewardLib.sol";
import {
  AttestationLib,
  Signature,
  CommitteeAttestation,
  CommitteeAttestations
} from "@aztec/core/libraries/rollup/AttestationLib.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";
import {AttestationLibHelper} from "@test/helper_libraries/AttestationLibHelper.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {IInbox} from "@aztec/core/interfaces/messagebridge/IInbox.sol";
import {Signature} from "@aztec/shared/libraries/SignatureLib.sol";
import {BlockLog} from "@aztec/core/libraries/compressed-data/BlockLog.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
// solhint-disable comprehensive-interface

struct Block {
  ProposeArgs proposeArgs;
  bytes blobInputs;
  CommitteeAttestation[] attestations;
  address[] signers;
  Signature attestationsAndSignersSignature;
}

contract Tmnt419Test is RollupBase {
  using ProposeLib for ProposeArgs;
  using TimeLib for Timestamp;
  using TimeLib for Slot;
  using TimeLib for Epoch;
  using stdStorage for StdStorage;

  Registry internal registry;
  TestERC20 internal testERC20;
  FeeJuicePortal internal feeJuicePortal;
  RewardDistributor internal rewardDistributor;
  TimeCheater internal timeCheater;

  uint256 internal SLOT_DURATION;
  uint256 internal EPOCH_DURATION;
  uint256 internal PROOF_SUBMISSION_EPOCHS;
  uint256 internal MANA_TARGET = 0;

  address internal sequencer = address(bytes20("sequencer"));

  DecoderBase.Full internal full;

  /**
   * @notice  Set up the contracts needed for the tests with time aligned to the provided block name
   */
  modifier setUpFor(string memory _name) {
    {
      full = load(_name);
      Slot slotNumber = full.block.header.slotNumber;
      uint256 initialTime = Timestamp.unwrap(full.block.header.timestamp) - Slot.unwrap(slotNumber) * SLOT_DURATION;
      vm.warp(initialTime);
    }

    TimeLib.initialize(
      block.timestamp,
      TestConstants.AZTEC_SLOT_DURATION,
      TestConstants.AZTEC_EPOCH_DURATION,
      TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS
    );
    SLOT_DURATION = TestConstants.AZTEC_SLOT_DURATION;
    EPOCH_DURATION = TestConstants.AZTEC_EPOCH_DURATION;
    PROOF_SUBMISSION_EPOCHS = TestConstants.AZTEC_PROOF_SUBMISSION_EPOCHS;
    timeCheater =
      new TimeCheater(address(this), block.timestamp, SLOT_DURATION, EPOCH_DURATION, PROOF_SUBMISSION_EPOCHS);

    RollupBuilder builder = new RollupBuilder(address(this)).setManaTarget(MANA_TARGET).setTargetCommitteeSize(0);
    builder.deploy();

    rollup = IInstance(address(builder.getConfig().rollup));
    testERC20 = builder.getConfig().testERC20;
    registry = builder.getConfig().registry;

    feeJuicePortal = FeeJuicePortal(address(rollup.getFeeAssetPortal()));
    rewardDistributor = RewardDistributor(address(registry.getRewardDistributor()));

    _;
  }

  function test_getStorageTempBlockLog() public setUpFor("empty_block_1") {
    skipBlobCheck(address(rollup));
    timeCheater.cheat__progressSlot();

    for (uint256 i = 0; i < 100; i++) {
      Block memory l2Block = getBlock();
      rollup.propose(
        l2Block.proposeArgs,
        AttestationLibHelper.packAttestations(l2Block.attestations),
        l2Block.signers,
        l2Block.attestationsAndSignersSignature,
        l2Block.blobInputs
      );
      timeCheater.cheat__progressSlot();

      stdstore.enable_packed_slots().target(address(rollup)).sig("getProvenBlockNumber()").checked_write(
        rollup.getPendingBlockNumber()
      );
    }

    assertEq(rollup.getProvenBlockNumber(), 100);

    // Read something so old that it should be stale
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__UnavailableTempBlockLog.selector, 1, 100, 1 + 1 + TestConstants.AZTEC_EPOCH_DURATION * 2
      )
    );
    rollup.getBlock(1);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__UnavailableTempBlockLog.selector, 100 - (1 + TestConstants.AZTEC_EPOCH_DURATION * 2), 100, 100
      )
    );
    rollup.getBlock(100 - (1 + TestConstants.AZTEC_EPOCH_DURATION * 2));

    // Read something current
    rollup.getBlock(rollup.getPendingBlockNumber());

    // Try to read into the future see a failure
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__UnavailableTempBlockLog.selector, 101, 100, 101 + 1 + TestConstants.AZTEC_EPOCH_DURATION * 2
      )
    );
    rollup.getBlock(101);
  }

  function getBlock() internal view returns (Block memory) {
    // We will be using the genesis for both before and after. This will be impossible
    // to prove, but we don't need to prove anything here.
    bytes32 archiveRoot = bytes32(Constants.GENESIS_ARCHIVE_ROOT);

    ProposedHeader memory header = full.block.header;

    Slot slotNumber = rollup.getCurrentSlot();
    Timestamp ts = rollup.getTimestampForSlot(slotNumber);

    // Updating the header with important information!
    header.lastArchiveRoot = archiveRoot;
    header.slotNumber = slotNumber;
    header.timestamp = ts;
    header.coinbase = address(bytes20("coinbase"));
    header.feeRecipient = bytes32(0);
    header.gasFees.feePerL2Gas = SafeCast.toUint128(rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true));
    if (MANA_TARGET > 0) {
      header.totalManaUsed = MANA_TARGET;
    } else {
      header.totalManaUsed = 0;
    }

    ProposeArgs memory proposeArgs = ProposeArgs({
      header: header,
      archive: archiveRoot,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput({feeAssetPriceModifier: 0})
    });

    CommitteeAttestation[] memory attestations = new CommitteeAttestation[](0);
    address[] memory signers = new address[](0);

    return Block({
      proposeArgs: proposeArgs,
      blobInputs: full.block.blobCommitments,
      attestations: attestations,
      signers: signers,
      attestationsAndSignersSignature: Signature({v: 0, r: 0, s: 0})
    });
  }
}
