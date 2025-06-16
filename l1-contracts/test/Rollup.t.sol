// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "./base/DecoderBase.sol";

import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Math} from "@oz/utils/math/Math.sol";
import {SafeCast} from "@oz/utils/math/SafeCast.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {ProposedHeader} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";

import {
  IRollupCore,
  BlockLog,
  SubmitEpochRootProofArgs,
  EthValue,
  FeeAssetValue,
  FeeAssetPerEthE9,
  PublicInputArgs
} from "@aztec/core/interfaces/IRollup.sol";
import {FeeJuicePortal} from "@aztec/core/messagebridge/FeeJuicePortal.sol";
import {MerkleTestUtil} from "./merkle/TestUtil.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {TestConstants} from "./harnesses/TestConstants.sol";
import {RewardDistributor} from "@aztec/governance/RewardDistributor.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";
import {ProposeArgs, OracleInput, ProposeLib} from "@aztec/core/libraries/rollup/ProposeLib.sol";
import {
  Timestamp, Slot, Epoch, SlotLib, EpochLib, TimeLib
} from "@aztec/core/libraries/TimeLib.sol";
import {L1_GAS_PER_EPOCH_VERIFIED} from "@aztec/core/libraries/rollup/FeeLib.sol";

import {RollupBase, IInstance} from "./base/RollupBase.sol";
import {stdStorage, StdStorage} from "forge-std/StdStorage.sol";
import {RollupBuilder} from "./builder/RollupBuilder.sol";
import {Ownable} from "@oz/access/Ownable.sol";
// solhint-disable comprehensive-interface

/**
 * Blocks are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 */
contract RollupTest is RollupBase {
  using stdStorage for StdStorage;
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
      DecoderBase.Full memory full = load(_name);
      uint256 slotNumber = Slot.unwrap(full.block.header.slotNumber);
      uint256 initialTime =
        Timestamp.unwrap(full.block.header.timestamp) - slotNumber * SLOT_DURATION;
      vm.warp(initialTime);
    }

    RollupBuilder builder = new RollupBuilder(address(this)).setTargetCommitteeSize(0);
    builder.deploy();

    testERC20 = builder.getConfig().testERC20;
    registry = builder.getConfig().registry;
    rewardDistributor = builder.getConfig().rewardDistributor;
    rollup = IInstance(address(builder.getConfig().rollup));

    inbox = Inbox(address(rollup.getInbox()));
    outbox = Outbox(address(rollup.getOutbox()));

    feeJuicePortal = FeeJuicePortal(address(rollup.getFeeAssetPortal()));

    merkleTestUtil = new MerkleTestUtil();
    _;
  }

  function warpToL2Slot(uint256 _slot) public {
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(_slot))));
  }

  function testPruneAfterPartial() public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 1);
    _proposeBlock("mixed_block_2", 2);

    warpToL2Slot(rollup.getProofSubmissionWindow());
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NothingToPrune.selector));
    rollup.prune();

    _proveBlocks("mixed_block_", 1, 1, address(this));

    warpToL2Slot(rollup.getProofSubmissionWindow() + 1);
    rollup.prune();

    assertEq(rollup.getPendingBlockNumber(), 1);
    assertEq(rollup.getProvenBlockNumber(), 1);
  }

  function testSetManaTargetIncreasing(uint256 _initialManaTarget, uint256 _newManaTarget)
    public
    setUpFor("mixed_block_1")
  {
    // we can increase the mana target
    _initialManaTarget = bound(_initialManaTarget, 0, 1e36);
    _newManaTarget = bound(_newManaTarget, _initialManaTarget, 1e36);

    RollupBuilder builder =
      new RollupBuilder(address(this)).setManaTarget(_initialManaTarget).deploy();

    address governance = address(builder.getConfig().governance);
    rollup = IInstance(address(builder.getConfig().rollup));

    assertEq(rollup.getManaTarget(), _initialManaTarget);

    vm.expectEmit(true, true, true, true);
    emit IRollupCore.ManaTargetUpdated(_newManaTarget);
    vm.prank(governance);
    rollup.updateManaTarget(_newManaTarget);
    assertEq(rollup.getManaTarget(), _newManaTarget);
  }

  function testSetManaTargetDecreasing(uint256 _initialManaTarget, uint256 _newManaTarget)
    public
    setUpFor("mixed_block_1")
  {
    // we cannot decrease the mana target
    _initialManaTarget = bound(_initialManaTarget, 1, 1e36);
    _newManaTarget = bound(_newManaTarget, 0, _initialManaTarget - 1);

    RollupBuilder builder =
      new RollupBuilder(address(this)).setManaTarget(_initialManaTarget).deploy();

    address governance = address(builder.getConfig().governance);
    rollup = IInstance(address(builder.getConfig().rollup));

    assertEq(rollup.getManaTarget(), _initialManaTarget);

    // Cannot decrease the mana target
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InvalidManaTarget.selector, _initialManaTarget, _newManaTarget
      )
    );
    vm.prank(governance);
    rollup.updateManaTarget(_newManaTarget);
    assertEq(rollup.getManaTarget(), _initialManaTarget);
  }

  function testPrune() public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 1);

    assertEq(inbox.getInProgress(), 3, "Invalid in progress");

    // @note  Fetch the inbox root of block 2. This should be frozen when block 1 is proposed.
    //        Even if we end up reverting block 1, we should still see the same root in the inbox.
    bytes32 inboxRoot2 = inbox.getRoot(2);

    BlockLog memory blockLog = rollup.getBlock(1);
    Slot prunableAt = blockLog.slotNumber + Epoch.wrap(2).toSlots();

    Timestamp timeOfPrune = rollup.getTimestampForSlot(prunableAt);
    vm.warp(Timestamp.unwrap(timeOfPrune));

    assertEq(rollup.getPendingBlockNumber(), 1, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");

    // @note  Get the root that we have in the outbox.
    //        We read it directly in storage because it is not yet proven, so the getter will give (0, 0).
    //        The values are stored such that we can check that after pruning, and inserting a new block,
    //        we will override it.
    bytes32 rootMixed = vm.load(address(outbox), keccak256(abi.encode(1, 0)));
    assertNotEq(rootMixed, bytes32(0), "Invalid root");

    rollup.prune();
    assertEq(inbox.getInProgress(), 3, "Invalid in progress");
    assertEq(rollup.getPendingBlockNumber(), 0, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");

    // @note  We alter what slot is specified in the empty block!
    //        This means that we keep the `empty_block_1` mostly as is, but replace the slot number
    //        and timestamp as if it was created at a different point in time. This allow us to insert it
    //        as if it was the first block, even after we had originally inserted the mixed block.
    //        An example where this could happen would be if no-one could prove the mixed block.
    // @note  We prune the pending chain as part of the propose call.
    _proposeBlock("empty_block_1", prunableAt.unwrap());

    assertEq(inbox.getInProgress(), 3, "Invalid in progress");
    assertEq(inbox.getRoot(2), inboxRoot2, "Invalid inbox root");
    assertEq(rollup.getPendingBlockNumber(), 1, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");

    // We check that the roots in the outbox have correctly been updated.
    bytes32 rootEmpty = vm.load(address(outbox), keccak256(abi.encode(1, 0)));
    assertEq(rootEmpty, bytes32(0), "Invalid root");
  }

  function testTimestamp() public setUpFor("mixed_block_1") {
    // Ensure that the timestamp of the current slot is never in the future.
    for (uint256 i = 0; i < 100; i++) {
      Slot slot = rollup.getCurrentSlot();
      Timestamp ts = rollup.getTimestampForSlot(slot);

      assertLe(ts, block.timestamp, "Invalid timestamp");

      vm.warp(block.timestamp + 12);
      vm.roll(block.number + 1);
    }
  }

  function testInvalidBlobHash() public setUpFor("mixed_block_1") {
    DecoderBase.Data memory data = load("mixed_block_1").block;

    // We set the blobHash to 1
    bytes32[] memory blobHashes = new bytes32[](1);
    blobHashes[0] = bytes32(uint256(1));
    vm.blobhashes(blobHashes);
    ProposeArgs memory args = ProposeArgs({
      header: data.header,
      archive: data.archive,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput(0),
      txHashes: new bytes32[](0)
    });
    bytes32 realBlobHash = this.getBlobHashes(data.blobCommitments)[0];
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InvalidBlobHash.selector, blobHashes[0], realBlobHash)
    );
    rollup.propose(args, attestations, data.blobCommitments);
  }

  function testTooManyBlobs() public setUpFor("mixed_block_1") {
    DecoderBase.Data memory data = load("mixed_block_1").block;
    bytes32[] memory realBlobHashes = this.getBlobHashes(data.blobCommitments);
    bytes32[] memory blobHashes = new bytes32[](realBlobHashes.length + 1);
    for (uint256 i = 0; i < realBlobHashes.length; i++) {
      blobHashes[i] = realBlobHashes[i];
    }
    // Add an extra blob which shouldn't exist
    blobHashes[realBlobHashes.length] = bytes32(uint256(1));
    vm.blobhashes(blobHashes);
    ProposeArgs memory args = ProposeArgs({
      header: data.header,
      archive: data.archive,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput(0),
      txHashes: new bytes32[](0)
    });
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InvalidBlobHash.selector, blobHashes[realBlobHashes.length], 0
      )
    );
    rollup.propose(args, attestations, data.blobCommitments);
  }

  function testRevertPrune() public setUpFor("mixed_block_1") {
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NothingToPrune.selector));
    rollup.prune();

    _proposeBlock("mixed_block_1", 1);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NothingToPrune.selector));
    rollup.prune();
  }

  function testShouldNotBeTooEagerToPrune() public setUpFor("mixed_block_1") {
    warpToL2Slot(1);
    _proposeBlock("mixed_block_1", 1);
    // we prove epoch 0
    stdstore.target(address(rollup)).sig("getProvenBlockNumber()").checked_write(
      rollup.getPendingBlockNumber()
    );

    // jump to epoch 1
    warpToL2Slot(EPOCH_DURATION);
    _proposeBlock("mixed_block_2", EPOCH_DURATION);

    // jump to epoch 2
    warpToL2Slot(EPOCH_DURATION * 2);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NothingToPrune.selector));
    rollup.prune();
  }

  function testPruneDuringPropose() public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 1);

    // the same block is proposed, with the diff in slot number.
    _proposeBlock("mixed_block_1", rollup.getProofSubmissionWindow() + 1);

    assertEq(rollup.getPendingBlockNumber(), 1, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");
  }

  function testNonZeroDaFee() public setUpFor("mixed_block_1") {
    DecoderBase.Full memory full = load("mixed_block_1");
    DecoderBase.Data memory data = full.block;
    ProposedHeader memory header = data.header;
    bytes32[] memory txHashes = new bytes32[](0);

    // Tweak the da fee.
    header.gasFees.feePerDaGas = 1;

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, Timestamp.unwrap(header.timestamp)));

    skipBlobCheck(address(rollup));

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NonZeroDaFee.selector));
    ProposeArgs memory args = ProposeArgs({
      header: header,
      archive: data.archive,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput(0),
      txHashes: txHashes
    });
    rollup.propose(args, attestations, data.blobCommitments);
  }

  function testInvalidL2Fee() public setUpFor("mixed_block_1") {
    DecoderBase.Full memory full = load("mixed_block_1");
    DecoderBase.Data memory data = full.block;
    ProposedHeader memory header = data.header;
    bytes32[] memory txHashes = new bytes32[](0);

    // Tweak the base fee.
    header.gasFees.feePerL2Gas = 1;

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, Timestamp.unwrap(header.timestamp)));

    skipBlobCheck(address(rollup));

    uint256 expectedFee = rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true);

    // When not canonical, we expect the fee to be 0
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InvalidManaBaseFee.selector, expectedFee, 1)
    );
    ProposeArgs memory args = ProposeArgs({
      header: header,
      archive: data.archive,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput(0),
      txHashes: txHashes
    });
    rollup.propose(args, attestations, data.blobCommitments);
  }

  function testProvingFeeUpdates() public setUpFor("mixed_block_1") {
    // We need to mint some fee asset to the portal to cover the 2M mana spent.
    deal(address(testERC20), address(feeJuicePortal), 2e6 * 1e18);

    vm.prank(Ownable(address(rollup)).owner());
    rollup.setProvingCostPerMana(EthValue.wrap(1000));
    _proposeBlock("mixed_block_1", 1, 1e6);

    vm.prank(Ownable(address(rollup)).owner());
    rollup.setProvingCostPerMana(EthValue.wrap(2000));
    _proposeBlock("mixed_block_2", 2, 1e6);

    // At this point in time, we have had different proving costs for the two blocks. When we prove them
    // in the same epoch, we want to see that the correct fee is taken for each block.
    _proveBlocks("mixed_block_", 1, 2, address(this));

    // 1e6 mana at 1000 and 2000 cost per manage multiplied by 10 for the price conversion to fee asset.
    uint256 proverFees = 1e6 * (1000 + 2000);
    // Then we also need the component that is for covering the gas
    proverFees += (
      Math.mulDiv(
        Math.mulDiv(
          L1_GAS_PER_EPOCH_VERIFIED,
          rollup.getL1FeesAt(rollup.getTimestampForSlot(Slot.wrap(1))).baseFee,
          rollup.getEpochDuration(),
          Math.Rounding.Ceil
        ),
        1,
        rollup.getManaTarget(),
        Math.Rounding.Ceil
      ) * 1e6
    );

    proverFees += (
      Math.mulDiv(
        Math.mulDiv(
          L1_GAS_PER_EPOCH_VERIFIED,
          rollup.getL1FeesAt(rollup.getTimestampForSlot(Slot.wrap(2))).baseFee,
          rollup.getEpochDuration(),
          Math.Rounding.Ceil
        ),
        1,
        rollup.getManaTarget(),
        Math.Rounding.Ceil
      ) * 1e6
    );
    proverFees *= 10; // the price conversion

    uint256 expectedProverRewards = rewardDistributor.BLOCK_REWARD() / 2 * 2 + proverFees;

    assertEq(
      rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(0)),
      expectedProverRewards,
      "invalid prover rewards"
    );
  }

  struct TestBlockFeeStruct {
    EthValue provingCostPerManaInEth;
    FeeAssetValue provingCostPerManaInFeeAsset;
    uint128 baseFee;
    uint256 feeAmount;
    uint256 portalBalance;
    uint256 manaUsed;
    uint256 time;
  }

  function testBlockFee() public setUpFor("mixed_block_1") {
    TestBlockFeeStruct memory interim;

    DecoderBase.Data memory data = load("mixed_block_1").block;
    ProposedHeader memory header = data.header;
    interim.portalBalance = testERC20.balanceOf(address(feeJuicePortal));
    interim.provingCostPerManaInEth = rollup.getProvingCostPerManaInEth();
    interim.provingCostPerManaInFeeAsset = rollup.getProvingCostPerManaInFeeAsset();
    interim.manaUsed = 1e6;

    // Progress time as necessary
    vm.warp(max(block.timestamp, Timestamp.unwrap(header.timestamp)));

    interim.time = block.timestamp;

    {
      assertEq(testERC20.balanceOf(address(rollup)), 0, "invalid rollup balance");

      // We jump to the time of the block. (unless it is in the past)
      vm.warp(max(block.timestamp, Timestamp.unwrap(header.timestamp)));

      uint256 coinbaseBalance = testERC20.balanceOf(header.coinbase);
      assertEq(coinbaseBalance, 0, "invalid initial coinbase balance");

      skipBlobCheck(address(rollup));
      interim.baseFee =
        SafeCast.toUint128(rollup.getManaBaseFeeAt(Timestamp.wrap(block.timestamp), true));

      header.gasFees.feePerL2Gas = interim.baseFee;
      header.totalManaUsed = interim.manaUsed;

      // We mess up the fees and say that someone is paying a massive priority which surpass the amount available.
      interim.feeAmount = interim.manaUsed * interim.baseFee + interim.portalBalance;

      // Assert that balance have NOT been increased by proposing the block
      ProposeArgs memory args = ProposeArgs({
        header: header,
        archive: data.archive,
        stateReference: EMPTY_STATE_REFERENCE,
        oracleInput: OracleInput(0),
        txHashes: new bytes32[](0)
      });
      rollup.propose(args, attestations, data.blobCommitments);
      assertEq(testERC20.balanceOf(header.coinbase), 0, "invalid coinbase balance");
    }

    BlockLog memory blockLog = rollup.getBlock(0);
    warpToL2Slot(rollup.getProofSubmissionWindow() - 1);

    address prover = address(0x1234);

    {
      vm.expectRevert(
        abi.encodeWithSelector(
          IERC20Errors.ERC20InsufficientBalance.selector,
          address(feeJuicePortal),
          interim.portalBalance,
          interim.feeAmount
        )
      );
      _submitEpochProofWithFee(
        1,
        1,
        blockLog.archive,
        data.archive,
        data.batchedBlobInputs,
        prover,
        header.coinbase,
        interim.feeAmount
      );
    }
    assertEq(testERC20.balanceOf(header.coinbase), 0, "invalid coinbase balance");
    assertEq(rollup.getSequencerRewards(header.coinbase), 0, "invalid sequencer rewards");
    assertEq(testERC20.balanceOf(prover), 0, "invalid prover balance");
    assertEq(rollup.getCollectiveProverRewardsForEpoch(Epoch.wrap(0)), 0, "invalid prover rewards");

    {
      testERC20.mint(address(feeJuicePortal), interim.feeAmount - interim.portalBalance);

      // When the block is proven we should have received the funds
      _submitEpochProofWithFee(
        1,
        1,
        blockLog.archive,
        data.archive,
        data.batchedBlobInputs,
        address(42),
        header.coinbase,
        interim.feeAmount
      );

      {
        FeeAssetPerEthE9 price = rollup.getFeeAssetPerEth();
        uint256 provingCosts = Math.mulDiv(
          EthValue.unwrap(interim.provingCostPerManaInEth), FeeAssetPerEthE9.unwrap(price), 1e9
        );
        assertEq(
          provingCosts,
          FeeAssetValue.unwrap(interim.provingCostPerManaInFeeAsset),
          "invalid proving costs"
        );
      }

      uint256 expectedProverReward = rewardDistributor.BLOCK_REWARD() / 2
        + FeeAssetValue.unwrap(interim.provingCostPerManaInFeeAsset) * interim.manaUsed;
      uint256 expectedSequencerReward = rewardDistributor.BLOCK_REWARD() / 2 + interim.feeAmount
        - FeeAssetValue.unwrap(interim.provingCostPerManaInFeeAsset) * interim.manaUsed;

      assertEq(
        rollup.getSequencerRewards(header.coinbase),
        expectedSequencerReward,
        "invalid sequencer rewards"
      );

      Epoch epoch = rollup.getBlock(1).slotNumber.epochFromSlot();

      assertEq(
        rollup.getCollectiveProverRewardsForEpoch(epoch),
        expectedProverReward,
        "invalid prover rewards"
      );
    }
  }

  function testMixedBlock(bool _toProve) public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 1);

    if (_toProve) {
      _proveBlocks("mixed_block_", 1, 1, address(0));
    }

    assertEq(rollup.getPendingBlockNumber(), 1, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), _toProve ? 1 : 0, "Invalid proven block number");
  }

  function testConsecutiveMixedBlocks(uint256 _blocksToProve) public setUpFor("mixed_block_1") {
    uint256 toProve = bound(_blocksToProve, 0, 2);

    _proposeBlock("mixed_block_1", 1);
    _proposeBlock("mixed_block_2", 2);

    if (toProve > 0) {
      _proveBlocks("mixed_block_", 1, toProve, address(0));
    }

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0 + toProve, "Invalid proven block number");
  }

  function testSingleBlock(bool _toProve) public setUpFor("single_tx_block_1") {
    _proposeBlock("single_tx_block_1", 1);

    if (_toProve) {
      _proveBlocks("single_tx_block_", 1, 1, address(0));
    }

    assertEq(rollup.getPendingBlockNumber(), 1, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), _toProve ? 1 : 0, "Invalid proven block number");
  }

  function testConsecutiveSingleTxBlocks(uint256 _blocksToProve)
    public
    setUpFor("single_tx_block_1")
  {
    uint256 toProve = bound(_blocksToProve, 0, 2);

    _proposeBlock("single_tx_block_1", 1);
    _proposeBlock("single_tx_block_2", 2);

    if (toProve > 0) {
      _proveBlocks("single_tx_block_", 1, toProve, address(0));
    }

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0 + toProve, "Invalid proven block number");
  }

  function testRevertSubmittingProofForBlocksAcrossEpochs() public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 1);
    _proposeBlock("mixed_block_2", TestConstants.AZTEC_EPOCH_DURATION + 1);

    DecoderBase.Data memory data = load("mixed_block_2").block;

    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid initial proven block number");

    BlockLog memory blockLog = rollup.getBlock(0);

    PublicInputArgs memory args = PublicInputArgs({
      previousArchive: blockLog.archive,
      endArchive: data.archive,
      proverId: address(0)
    });

    bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);

    fees[0] = bytes32(uint256(uint160(address(0))));
    fees[1] = bytes32(0);

    bytes memory proof = "";

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__StartAndEndNotSameEpoch.selector, Epoch.wrap(0), Epoch.wrap(1)
      )
    );

    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: 1,
        end: 2,
        args: args,
        fees: fees,
        blobInputs: data.batchedBlobInputs,
        proof: proof
      })
    );

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");
  }

  function testProveEpochWithTwoMixedBlocks() public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 1);
    _proposeBlock("mixed_block_2", 2);

    DecoderBase.Data memory data = load("mixed_block_2").block;

    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid initial proven block number");
    BlockLog memory blockLog = rollup.getBlock(0);
    _submitEpochProof(1, 2, blockLog.archive, data.archive, data.batchedBlobInputs, address(0));

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 2, "Invalid proven block number");
  }

  function testConsecutiveMixedBlocksNonSequentialProof() public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 200);
    _proposeBlock("mixed_block_2", 201);

    // Should fail here.
    _proveBlocksFail(
      "mixed_block_",
      2,
      2,
      address(0),
      abi.encodeWithSelector(Errors.Rollup__StartIsNotFirstBlockOfEpoch.selector)
    );

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");
  }

  function testEmptyBlock(bool _toProve) public setUpFor("empty_block_1") {
    _proposeBlock("empty_block_1", 1);

    if (_toProve) {
      _proveBlocks("empty_block_", 1, 1, address(0));
    }

    assertEq(rollup.getPendingBlockNumber(), 1, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), _toProve ? 1 : 0, "Invalid proven block number");
  }

  function testConsecutiveEmptyBlocks(uint256 _blocksToProve) public setUpFor("empty_block_1") {
    uint256 toProve = bound(_blocksToProve, 0, 2);
    _proposeBlock("empty_block_1", 1);
    _proposeBlock("empty_block_2", 2);

    if (toProve > 0) {
      _proveBlocks("empty_block_", 1, toProve, address(0));
    }

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0 + toProve, "Invalid proven block number");
  }

  function testRevertInvalidTimestamp() public setUpFor("empty_block_1") {
    DecoderBase.Data memory data = load("empty_block_1").block;
    ProposedHeader memory header = data.header;
    bytes32 archive = data.archive;
    bytes32[] memory txHashes = new bytes32[](0);

    Timestamp realTs = header.timestamp;
    Timestamp badTs = realTs + Timestamp.wrap(1);

    vm.warp(max(block.timestamp, Timestamp.unwrap(realTs)));

    // Tweak the timestamp.
    header.timestamp = badTs;

    skipBlobCheck(address(rollup));
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidTimestamp.selector, realTs, badTs));
    ProposeArgs memory args = ProposeArgs({
      header: header,
      archive: archive,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput(0),
      txHashes: txHashes
    });
    rollup.propose(args, attestations, new bytes(144));
  }

  function testRevertInvalidCoinbase() public setUpFor("empty_block_1") {
    DecoderBase.Data memory data = load("empty_block_1").block;
    ProposedHeader memory header = data.header;
    bytes32 archive = data.archive;
    bytes32[] memory txHashes = new bytes32[](0);

    Timestamp realTs = header.timestamp;

    vm.warp(max(block.timestamp, Timestamp.unwrap(realTs)));

    // Tweak the coinbase.
    header.coinbase = address(0);

    skipBlobCheck(address(rollup));
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidCoinbase.selector));
    ProposeArgs memory args = ProposeArgs({
      header: header,
      archive: archive,
      stateReference: EMPTY_STATE_REFERENCE,
      oracleInput: OracleInput(0),
      txHashes: txHashes
    });
    rollup.propose(args, attestations, new bytes(144));
  }

  function testSubmitProofNonExistentBlock() public setUpFor("empty_block_1") {
    _proposeBlock("empty_block_1", 1);
    DecoderBase.Data memory data = load("empty_block_1").block;

    BlockLog memory blockLog = rollup.getBlock(0);
    bytes32 wrong = bytes32(uint256(0xdeadbeef));
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InvalidPreviousArchive.selector, blockLog.archive, wrong
      )
    );
    _submitEpochProof(1, 1, wrong, data.archive, data.batchedBlobInputs, address(0));
  }

  function testSubmitProofInvalidArchive() public setUpFor("empty_block_1") {
    _proposeBlock("empty_block_1", 1);

    DecoderBase.Data memory data = load("empty_block_1").block;
    bytes32 wrongArchive = bytes32(uint256(0xdeadbeef));

    BlockLog memory blockLog = rollup.getBlock(0);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InvalidArchive.selector, data.archive, 0xdeadbeef)
    );
    _submitEpochProof(1, 1, blockLog.archive, wrongArchive, data.batchedBlobInputs, address(0));
  }

  function testInvalidBlobProof() public setUpFor("mixed_block_1") {
    _proposeBlock({_name: "mixed_block_1", _slotNumber: 0});

    DecoderBase.Data memory data = load("mixed_block_1").block;
    bytes memory blobProofInputs = data.batchedBlobInputs;
    // mess with the data
    blobProofInputs[100] = 0x01;
    // The below is the "blob hash" == bytes [0:32] of batchedBlobInputs = VERSIONED_HASH_VERSION_KZG + sha256(batchedBlobCommitment)[1:]
    bytes32 blobHash;
    assembly {
      blobHash := mload(add(blobProofInputs, 0x20))
    }

    BlockLog memory blockLog = rollup.getBlock(0);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidBlobProof.selector, blobHash));
    _submitEpochProof(1, 1, blockLog.archive, data.archive, blobProofInputs, address(0));
  }

  function testTooManyBlocks() public setUpFor("mixed_block_1") {
    _proposeBlock("mixed_block_1", 1);
    DecoderBase.Data memory data = load("mixed_block_1").block;

    // Set the pending block number to be Constants.AZTEC_MAX_EPOCH_DURATION + 2, so we don't revert early with a different case
    stdstore.target(address(rollup)).sig("getPendingBlockNumber()").checked_write(
      Constants.AZTEC_MAX_EPOCH_DURATION + 2
    );

    BlockLog memory blockLog = rollup.getBlock(0);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__TooManyBlocksInEpoch.selector,
        Constants.AZTEC_MAX_EPOCH_DURATION,
        Constants.AZTEC_MAX_EPOCH_DURATION + 1
      )
    );
    _submitEpochProof(
      1,
      Constants.AZTEC_MAX_EPOCH_DURATION + 2,
      blockLog.archive,
      data.archive,
      data.batchedBlobInputs,
      address(0)
    );
  }

  function _submitEpochProof(
    uint256 _start,
    uint256 _end,
    bytes32 _prevArchive,
    bytes32 _archive,
    bytes memory _blobInputs,
    address _prover
  ) internal {
    _submitEpochProofWithFee(
      _start, _end, _prevArchive, _archive, _blobInputs, _prover, address(0), 0
    );
  }

  function _submitEpochProofWithFee(
    uint256 _start,
    uint256 _end,
    bytes32 _prevArchive,
    bytes32 _archive,
    bytes memory _blobInputs,
    address _prover,
    address _coinbase,
    uint256 _fee
  ) internal {
    PublicInputArgs memory args =
      PublicInputArgs({previousArchive: _prevArchive, endArchive: _archive, proverId: _prover});

    bytes32[] memory fees = new bytes32[](Constants.AZTEC_MAX_EPOCH_DURATION * 2);
    fees[0] = bytes32(uint256(uint160(bytes20(_coinbase)))); // Need the address to be left padded within the bytes32
    fees[1] = bytes32(_fee);

    rollup.submitEpochRootProof(
      SubmitEpochRootProofArgs({
        start: _start,
        end: _end,
        args: args,
        fees: fees,
        blobInputs: _blobInputs,
        proof: ""
      })
    );
  }
}
