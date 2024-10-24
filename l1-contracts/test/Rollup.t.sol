// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "./decoders/Base.sol";

import {DataStructures} from "@aztec/core/libraries/DataStructures.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {SignatureLib} from "@aztec/core/libraries/crypto/SignatureLib.sol";
import {EpochProofQuoteLib} from "@aztec/core/libraries/EpochProofQuoteLib.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {Inbox} from "@aztec/core/messagebridge/Inbox.sol";
import {Outbox} from "@aztec/core/messagebridge/Outbox.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {Rollup} from "@aztec/core/Rollup.sol";
import {IRollup} from "@aztec/core/interfaces/IRollup.sol";
import {IProofCommitmentEscrow} from "@aztec/core/interfaces/IProofCommitmentEscrow.sol";
import {FeeJuicePortal} from "@aztec/core/FeeJuicePortal.sol";
import {Leonidas} from "@aztec/core/Leonidas.sol";
import {NaiveMerkle} from "./merkle/Naive.sol";
import {MerkleTestUtil} from "./merkle/TestUtil.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

import {TxsDecoderHelper} from "./decoders/helpers/TxsDecoderHelper.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";

import {Timestamp, Slot, Epoch, SlotLib, EpochLib} from "@aztec/core/libraries/TimeMath.sol";

// solhint-disable comprehensive-interface

/**
 * Blocks are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 */
contract RollupTest is DecoderBase {
  using SlotLib for Slot;
  using EpochLib for Epoch;

  Registry internal registry;
  Inbox internal inbox;
  Outbox internal outbox;
  Rollup internal rollup;
  MerkleTestUtil internal merkleTestUtil;
  TxsDecoderHelper internal txsHelper;
  TestERC20 internal testERC20;
  FeeJuicePortal internal feeJuicePortal;
  IProofCommitmentEscrow internal proofCommitmentEscrow;

  SignatureLib.Signature[] internal signatures;

  EpochProofQuoteLib.EpochProofQuote internal quote;
  EpochProofQuoteLib.SignedEpochProofQuote internal signedQuote;

  /**
   * @notice  Set up the contracts needed for the tests with time aligned to the provided block name
   */
  modifier setUpFor(string memory _name) {
    {
      Leonidas leo = new Leonidas(address(1));
      DecoderBase.Full memory full = load(_name);
      uint256 slotNumber = full.block.decodedHeader.globalVariables.slotNumber;
      uint256 initialTime =
        full.block.decodedHeader.globalVariables.timestamp - slotNumber * leo.SLOT_DURATION();
      vm.warp(initialTime);
    }

    registry = new Registry(address(this));
    testERC20 = new TestERC20();
    feeJuicePortal = new FeeJuicePortal(
      address(registry), address(testERC20), bytes32(Constants.FEE_JUICE_ADDRESS)
    );
    testERC20.mint(address(feeJuicePortal), Constants.FEE_JUICE_INITIAL_MINT);
    feeJuicePortal.initialize();
    rollup = new Rollup(feeJuicePortal, bytes32(0), bytes32(0), address(this), new address[](0));
    inbox = Inbox(address(rollup.INBOX()));
    outbox = Outbox(address(rollup.OUTBOX()));
    proofCommitmentEscrow = IProofCommitmentEscrow(address(rollup.PROOF_COMMITMENT_ESCROW()));

    registry.upgrade(address(rollup));

    merkleTestUtil = new MerkleTestUtil();
    txsHelper = new TxsDecoderHelper();

    uint256 privateKey = 0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef1234;
    address signer = vm.addr(privateKey);
    uint256 bond = rollup.PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_TST();
    quote = EpochProofQuoteLib.EpochProofQuote({
      epochToProve: Epoch.wrap(0),
      validUntilSlot: Slot.wrap(1),
      bondAmount: bond,
      prover: signer,
      basisPointFee: 0
    });
    signedQuote = _quoteToSignedQuote(quote);

    testERC20.mint(signer, bond * 10);
    vm.prank(signer);
    testERC20.approve(address(proofCommitmentEscrow), bond * 10);
    vm.prank(signer);
    proofCommitmentEscrow.deposit(bond * 10);

    _;
  }

  function warpToL2Slot(uint256 _slot) public {
    vm.warp(Timestamp.unwrap(rollup.getTimestampForSlot(Slot.wrap(_slot))));
  }

  function testClaimableEpoch(uint256 epochForMixedBlock) public setUpFor("mixed_block_1") {
    epochForMixedBlock = bound(epochForMixedBlock, 1, 10);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NoEpochToProve.selector));
    assertEq(rollup.getClaimableEpoch(), 0, "Invalid claimable epoch");

    quote.epochToProve = Epoch.wrap(epochForMixedBlock);
    quote.validUntilSlot = Slot.wrap(epochForMixedBlock * Constants.AZTEC_EPOCH_DURATION + 1);
    signedQuote = _quoteToSignedQuote(quote);

    _testBlock("mixed_block_1", false, epochForMixedBlock * Constants.AZTEC_EPOCH_DURATION);
    assertEq(rollup.getClaimableEpoch(), Epoch.wrap(epochForMixedBlock), "Invalid claimable epoch");

    rollup.claimEpochProofRight(signedQuote);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__ProofRightAlreadyClaimed.selector));
    rollup.getClaimableEpoch();
  }

  function testClaimWithNothingToProve() public setUpFor("mixed_block_1") {
    assertEq(rollup.getCurrentSlot(), 0, "genesis slot should be zero");

    // sanity check that proven/pending tip are at genesis
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NoEpochToProve.selector));
    rollup.claimEpochProofRight(signedQuote);

    warpToL2Slot(1);
    assertEq(rollup.getCurrentSlot(), 1, "warp to slot 1 failed");
    assertEq(rollup.getCurrentEpoch(), 0, "Invalid current epoch");

    // empty slots do not move pending chain
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NoEpochToProve.selector));
    rollup.claimEpochProofRight(signedQuote);
  }

  function testClaimWithWrongEpoch() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false, 1);
    quote.epochToProve = Epoch.wrap(1);
    signedQuote = _quoteToSignedQuote(quote);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__NotClaimingCorrectEpoch.selector, 0, signedQuote.quote.epochToProve
      )
    );
    rollup.claimEpochProofRight(signedQuote);
  }

  function testClaimWithInsufficientBond() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false, 1);

    quote.bondAmount = 0;
    signedQuote = _quoteToSignedQuote(quote);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InsufficientBondAmount.selector,
        rollup.PROOF_COMMITMENT_MIN_BOND_AMOUNT_IN_TST(),
        signedQuote.quote.bondAmount
      )
    );
    rollup.claimEpochProofRight(signedQuote);
  }

  function testClaimPastValidUntil() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false, 1);

    quote.validUntilSlot = Slot.wrap(0);
    signedQuote = _quoteToSignedQuote(quote);

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__QuoteExpired.selector, 1, signedQuote.quote.validUntilSlot
      )
    );
    rollup.claimEpochProofRight(signedQuote);
  }

  function testClaimSimple() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false, 1);

    vm.expectEmit(true, true, true, true);
    emit IRollup.ProofRightClaimed(
      quote.epochToProve, quote.prover, address(this), quote.bondAmount, Slot.wrap(1)
    );
    rollup.claimEpochProofRight(signedQuote);

    (
      Epoch epochToProve,
      uint256 basisPointFee,
      uint256 bondAmount,
      address bondProvider,
      address proposerClaimant
    ) = rollup.proofClaim();
    assertEq(epochToProve, signedQuote.quote.epochToProve, "Invalid epoch to prove");
    assertEq(basisPointFee, signedQuote.quote.basisPointFee, "Invalid basis point fee");
    assertEq(bondAmount, signedQuote.quote.bondAmount, "Invalid bond amount");
    assertEq(bondProvider, quote.prover, "Invalid bond provider");
    assertEq(proposerClaimant, address(this), "Invalid proposer claimant");
    assertEq(
      proofCommitmentEscrow.deposits(quote.prover), quote.bondAmount * 9, "Invalid escrow balance"
    );
  }

  function testProofReleasesBond() public setUpFor("mixed_block_1") {
    DecoderBase.Data memory data = load("mixed_block_1").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes32 blockHash = data.blockHash;
    bytes32 proverId = bytes32(uint256(42));
    bytes memory body = data.body;
    bytes32[] memory txHashes = new bytes32[](0);

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, data.decodedHeader.globalVariables.timestamp));

    rollup.propose(header, archive, blockHash, txHashes, signatures, body);

    quote.epochToProve = Epoch.wrap(1);
    quote.validUntilSlot = Epoch.wrap(2).toSlots();
    signedQuote = _quoteToSignedQuote(quote);
    rollup.claimEpochProofRight(signedQuote);
    (bytes32 preArchive, bytes32 preBlockHash,) = rollup.blocks(0);

    assertEq(
      proofCommitmentEscrow.deposits(quote.prover), quote.bondAmount * 9, "Invalid escrow balance"
    );

    _submitEpochProof(rollup, 1, preArchive, archive, preBlockHash, blockHash, proverId);

    assertEq(
      proofCommitmentEscrow.deposits(quote.prover), quote.bondAmount * 10, "Invalid escrow balance"
    );
  }

  function testMissingProofSlashesBond(uint256 slotsToJump) public setUpFor("mixed_block_1") {
    // @note, this gives a an overflow if bounding to type(uint256).max
    // Tracked by https://github.com/AztecProtocol/aztec-packages/issues/9362
    slotsToJump =
      bound(slotsToJump, 2 * Constants.AZTEC_EPOCH_DURATION, 1e20 * Constants.AZTEC_EPOCH_DURATION);
    _testBlock("mixed_block_1", false, 1);
    rollup.claimEpochProofRight(signedQuote);
    warpToL2Slot(slotsToJump);
    rollup.prune();
    _testBlock("mixed_block_1", true, slotsToJump);

    assertEq(
      proofCommitmentEscrow.deposits(quote.prover), 9 * quote.bondAmount, "Invalid escrow balance"
    );
  }

  function testClaimTwice() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false, 1);

    rollup.claimEpochProofRight(signedQuote);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__ProofRightAlreadyClaimed.selector));
    rollup.claimEpochProofRight(signedQuote);

    warpToL2Slot(2);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__ProofRightAlreadyClaimed.selector));
    rollup.claimEpochProofRight(signedQuote);

    // warp to epoch 1
    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION);
    assertEq(rollup.getCurrentEpoch(), 1, "Invalid current epoch");

    // We should still be trying to prove epoch 0 in epoch 1
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__ProofRightAlreadyClaimed.selector));
    rollup.claimEpochProofRight(signedQuote);

    // still nothing to prune
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NothingToPrune.selector));
    rollup.prune();
  }

  function testClaimOutsideClaimPhase() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false, 1);

    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION + rollup.CLAIM_DURATION_IN_L2_SLOTS());

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__NotInClaimPhase.selector,
        rollup.CLAIM_DURATION_IN_L2_SLOTS(),
        rollup.CLAIM_DURATION_IN_L2_SLOTS()
      )
    );
    rollup.claimEpochProofRight(signedQuote);
  }

  function testNoPruneWhenClaimExists() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false, 1);

    quote.validUntilSlot = Epoch.wrap(2).toSlots();
    signedQuote = _quoteToSignedQuote(quote);

    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION + rollup.CLAIM_DURATION_IN_L2_SLOTS() - 1);

    rollup.claimEpochProofRight(signedQuote);

    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION + rollup.CLAIM_DURATION_IN_L2_SLOTS());

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NothingToPrune.selector));
    rollup.prune();
  }

  function testPruneWhenClaimExpires() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false, 1);

    quote.validUntilSlot = Epoch.wrap(2).toSlots();
    signedQuote = _quoteToSignedQuote(quote);

    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION + rollup.CLAIM_DURATION_IN_L2_SLOTS() - 1);

    rollup.claimEpochProofRight(signedQuote);

    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION * 2);

    // We should still be trying to prove epoch 0 in epoch 2
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__ProofRightAlreadyClaimed.selector));
    rollup.claimEpochProofRight(signedQuote);

    rollup.prune();

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NoEpochToProve.selector));
    rollup.claimEpochProofRight(signedQuote);
  }

  function testClaimAfterPrune() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false, 1);

    quote.validUntilSlot = Epoch.wrap(3).toSlots();
    signedQuote = _quoteToSignedQuote(quote);

    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION + rollup.CLAIM_DURATION_IN_L2_SLOTS() - 1);

    rollup.claimEpochProofRight(signedQuote);

    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION * 3);

    rollup.prune();

    _testBlock("mixed_block_1", false, Epoch.wrap(3).toSlots().unwrap());

    quote.epochToProve = Epoch.wrap(3);
    signedQuote = _quoteToSignedQuote(quote);

    vm.expectEmit(true, true, true, true);
    emit IRollup.ProofRightClaimed(
      quote.epochToProve, quote.prover, address(this), quote.bondAmount, Epoch.wrap(3).toSlots()
    );
    rollup.claimEpochProofRight(signedQuote);
  }

  function testPruneWhenNoProofClaim() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false, 1);
    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION + rollup.CLAIM_DURATION_IN_L2_SLOTS() - 1);
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NothingToPrune.selector));
    rollup.prune();

    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION + rollup.CLAIM_DURATION_IN_L2_SLOTS());
    rollup.prune();
  }

  function testRevertProveTwice() public setUpFor("mixed_block_1") {
    DecoderBase.Data memory data = load("mixed_block_1").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes32 blockHash = data.blockHash;
    bytes32 proverId = bytes32(uint256(42));
    bytes memory body = data.body;
    bytes32[] memory txHashes = new bytes32[](0);

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, data.decodedHeader.globalVariables.timestamp));

    rollup.propose(header, archive, blockHash, txHashes, signatures, body);

    (bytes32 preArchive, bytes32 preBlockHash,) = rollup.blocks(0);
    _submitEpochProof(rollup, 1, preArchive, archive, preBlockHash, blockHash, proverId);

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InvalidPreviousArchive.selector, archive, preArchive)
    );
    _submitEpochProof(rollup, 1, preArchive, archive, preBlockHash, blockHash, proverId);
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

  function testRevertPrune() public setUpFor("mixed_block_1") {
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NothingToPrune.selector));
    rollup.prune();

    _testBlock("mixed_block_1", false);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NothingToPrune.selector));
    rollup.prune();
  }

  function testPrune() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false);

    assertEq(inbox.inProgress(), 3, "Invalid in progress");

    // @note  Fetch the inbox root of block 2. This should be frozen when block 1 is proposed.
    //        Even if we end up reverting block 1, we should still see the same root in the inbox.
    bytes32 inboxRoot2 = inbox.getRoot(2);

    (,, Slot slot) = rollup.blocks(1);
    Slot prunableAt = slot + Epoch.wrap(2).toSlots();

    Timestamp timeOfPrune = rollup.getTimestampForSlot(prunableAt);
    vm.warp(Timestamp.unwrap(timeOfPrune));

    assertEq(rollup.getPendingBlockNumber(), 1, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");

    // @note  Get the root and min height that we have in the outbox.
    //        We read it directly in storage because it is not yet proven, so the getter will give (0, 0).
    //        The values are stored such that we can check that after pruning, and inserting a new block,
    //        we will override it.
    bytes32 rootMixed = vm.load(address(outbox), keccak256(abi.encode(1, 0)));
    uint256 minHeightMixed =
      uint256(vm.load(address(outbox), bytes32(uint256(keccak256(abi.encode(1, 0))) + 1)));

    assertNotEq(rootMixed, bytes32(0), "Invalid root");
    assertNotEq(minHeightMixed, 0, "Invalid min height");

    rollup.prune();
    assertEq(inbox.inProgress(), 3, "Invalid in progress");
    assertEq(rollup.getPendingBlockNumber(), 0, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");

    // @note  We alter what slot is specified in the empty block!
    //        This means that we keep the `empty_block_1` mostly as is, but replace the slot number
    //        and timestamp as if it was created at a different point in time. This allow us to insert it
    //        as if it was the first block, even after we had originally inserted the mixed block.
    //        An example where this could happen would be if no-one could prove the mixed block.
    // @note  We prune the pending chain as part of the propose call.
    _testBlock("empty_block_1", false, prunableAt.unwrap());

    assertEq(inbox.inProgress(), 3, "Invalid in progress");
    assertEq(inbox.getRoot(2), inboxRoot2, "Invalid inbox root");
    assertEq(rollup.getPendingBlockNumber(), 1, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");

    // We check that the roots in the outbox have correctly been updated.
    bytes32 rootEmpty = vm.load(address(outbox), keccak256(abi.encode(1, 0)));
    uint256 minHeightEmpty =
      uint256(vm.load(address(outbox), bytes32(uint256(keccak256(abi.encode(1, 0))) + 1)));

    assertNotEq(rootEmpty, bytes32(0), "Invalid root");
    assertNotEq(minHeightEmpty, 0, "Invalid min height");
    assertNotEq(rootEmpty, rootMixed, "Invalid root");
    assertNotEq(minHeightEmpty, minHeightMixed, "Invalid min height");
  }

  function testShouldNotBeTooEagerToPrune() public setUpFor("mixed_block_1") {
    warpToL2Slot(1);
    _testBlock("mixed_block_1", false, 1);
    // we prove epoch 0
    rollup.setAssumeProvenThroughBlockNumber(rollup.getPendingBlockNumber());

    // jump to epoch 1
    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION);
    _testBlock("mixed_block_2", false, Constants.AZTEC_EPOCH_DURATION);

    // jump to epoch 2
    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION * 2);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NothingToPrune.selector));
    rollup.prune();
  }

  function testPruneDuringPropose() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false, 1);
    assertEq(rollup.getEpochToProve(), 0, "Invalid epoch to prove");
    warpToL2Slot(Constants.AZTEC_EPOCH_DURATION * 2);
    _testBlock("mixed_block_1", false, Epoch.wrap(2).toSlots().unwrap());

    assertEq(rollup.getPendingBlockNumber(), 1, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");
  }

  function testNonZeroDaFee() public setUpFor("mixed_block_1") {
    registry.upgrade(address(0xbeef));

    DecoderBase.Full memory full = load("mixed_block_1");
    DecoderBase.Data memory data = full.block;
    bytes memory header = data.header;
    assembly {
      mstore(add(header, add(0x20, 0x0208)), 1)
    }
    bytes32[] memory txHashes = new bytes32[](0);

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, data.decodedHeader.globalVariables.timestamp));

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NonZeroDaFee.selector));
    rollup.propose(header, data.archive, data.blockHash, txHashes, signatures, data.body);
  }

  function testNonZeroL2Fee() public setUpFor("mixed_block_1") {
    registry.upgrade(address(0xbeef));

    DecoderBase.Full memory full = load("mixed_block_1");
    DecoderBase.Data memory data = full.block;
    bytes memory header = data.header;
    assembly {
      mstore(add(header, add(0x20, 0x0228)), 1)
    }
    bytes32[] memory txHashes = new bytes32[](0);

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, data.decodedHeader.globalVariables.timestamp));

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NonZeroL2Fee.selector));
    rollup.propose(header, data.archive, data.blockHash, txHashes, signatures, data.body);
  }

  function testBlockFee() public setUpFor("mixed_block_1") {
    uint256 feeAmount = 2e18;

    DecoderBase.Data memory data = load("mixed_block_1").block;
    bytes32[] memory txHashes = new bytes32[](0);
    uint256 portalBalance = testERC20.balanceOf(address(feeJuicePortal));
    address coinbase = data.decodedHeader.globalVariables.coinbase;

    // Progress time as necessary
    vm.warp(max(block.timestamp, data.decodedHeader.globalVariables.timestamp));

    {
      bytes memory header = data.header;
      assembly {
        mstore(add(header, add(0x20, 0x0248)), feeAmount)
      }

      assertEq(testERC20.balanceOf(address(rollup)), 0, "invalid rollup balance");

      // We jump to the time of the block. (unless it is in the past)
      vm.warp(max(block.timestamp, data.decodedHeader.globalVariables.timestamp));

      uint256 coinbaseBalance = testERC20.balanceOf(coinbase);
      assertEq(coinbaseBalance, 0, "invalid initial coinbase balance");

      // Assert that balance have NOT been increased by proposing the block
      rollup.propose(header, data.archive, data.blockHash, txHashes, signatures, data.body);
      assertEq(testERC20.balanceOf(coinbase), 0, "invalid coinbase balance");
    }

    (bytes32 preArchive, bytes32 preBlockHash,) = rollup.blocks(0);

    {
      vm.expectRevert(
        abi.encodeWithSelector(
          IERC20Errors.ERC20InsufficientBalance.selector,
          address(feeJuicePortal),
          portalBalance,
          feeAmount
        )
      );
      _submitEpochProofWithFee(
        rollup,
        1,
        preArchive,
        data.archive,
        preBlockHash,
        data.blockHash,
        bytes32(uint256(42)),
        coinbase,
        feeAmount
      );
      assertEq(testERC20.balanceOf(coinbase), 0, "invalid coinbase balance");
    }

    {
      testERC20.mint(address(feeJuicePortal), feeAmount - portalBalance);

      // When the block is proven we should have received the funds
      _submitEpochProofWithFee(
        rollup,
        1,
        preArchive,
        data.archive,
        preBlockHash,
        data.blockHash,
        bytes32(uint256(42)),
        coinbase,
        feeAmount
      );
      assertEq(testERC20.balanceOf(coinbase), feeAmount, "invalid coinbase balance");
    }
  }

  function testMixedBlock(bool _toProve) public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", _toProve);

    assertEq(rollup.getPendingBlockNumber(), 1, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), _toProve ? 1 : 0, "Invalid proven block number");
  }

  function testConsecutiveMixedBlocks(uint256 _blocksToProve) public setUpFor("mixed_block_1") {
    uint256 toProve = bound(_blocksToProve, 0, 2);

    _testBlock("mixed_block_1", toProve > 0);
    _testBlock("mixed_block_2", toProve > 1);

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0 + toProve, "Invalid proven block number");
  }

  function testProveEpochWithTwoMixedBlocks() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false);
    _testBlock("mixed_block_2", false);

    DecoderBase.Data memory data = load("mixed_block_2").block;

    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid initial proven block number");
    (bytes32 preArchive, bytes32 preBlockHash,) = rollup.blocks(0);
    _submitEpochProof(rollup, 2, preArchive, data.archive, preBlockHash, data.blockHash, bytes32(0));

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 2, "Invalid proven block number");
  }

  function testConsecutiveMixedBlocksNonSequentialProof() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false);

    DecoderBase.Data memory data1 = load("mixed_block_1").block;
    DecoderBase.Data memory data2 = load("mixed_block_2").block;
    bytes32[] memory txHashes = new bytes32[](0);

    vm.warp(max(block.timestamp, data2.decodedHeader.globalVariables.timestamp));
    rollup.propose(data2.header, data2.archive, data2.blockHash, txHashes, signatures, data2.body);

    // Skips proving of block 1
    (bytes32 preArchive,,) = rollup.blocks(0);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InvalidPreviousArchive.selector, preArchive, data1.archive
      )
    );
    _submitEpochProof(
      rollup, 1, data1.archive, data2.archive, data1.archive, data2.archive, bytes32(0)
    );

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");
  }

  function testEmptyBlock(bool _toProve) public setUpFor("empty_block_1") {
    _testBlock("empty_block_1", _toProve);
    assertEq(rollup.getPendingBlockNumber(), 1, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), _toProve ? 1 : 0, "Invalid proven block number");
  }

  function testConsecutiveEmptyBlocks(uint256 _blocksToProve) public setUpFor("empty_block_1") {
    uint256 toProve = bound(_blocksToProve, 0, 2);
    _testBlock("empty_block_1", toProve > 0);
    _testBlock("empty_block_2", toProve > 1);

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0 + toProve, "Invalid proven block number");
  }

  function testRevertInvalidBlockNumber() public setUpFor("empty_block_1") {
    DecoderBase.Data memory data = load("empty_block_1").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes memory body = data.body;
    bytes32[] memory txHashes = new bytes32[](0);

    assembly {
      // TODO: Hardcoding offsets in the middle of tests is annoying to say the least.
      mstore(add(header, add(0x20, 0x0174)), 0x420)
    }

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidBlockNumber.selector, 1, 0x420));
    rollup.propose(header, archive, data.blockHash, txHashes, signatures, body);
  }

  function testRevertInvalidChainId() public setUpFor("empty_block_1") {
    DecoderBase.Data memory data = load("empty_block_1").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes memory body = data.body;
    bytes32[] memory txHashes = new bytes32[](0);

    assembly {
      mstore(add(header, add(0x20, 0x0134)), 0x420)
    }

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidChainId.selector, 31337, 0x420));
    rollup.propose(header, archive, data.blockHash, txHashes, signatures, body);
  }

  function testRevertInvalidVersion() public setUpFor("empty_block_1") {
    DecoderBase.Data memory data = load("empty_block_1").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes memory body = data.body;
    bytes32[] memory txHashes = new bytes32[](0);

    assembly {
      mstore(add(header, add(0x20, 0x0154)), 0x420)
    }

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidVersion.selector, 1, 0x420));
    rollup.propose(header, archive, data.blockHash, txHashes, signatures, body);
  }

  function testRevertInvalidTimestamp() public setUpFor("empty_block_1") {
    DecoderBase.Data memory data = load("empty_block_1").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes memory body = data.body;
    bytes32[] memory txHashes = new bytes32[](0);

    uint256 realTs = data.decodedHeader.globalVariables.timestamp;
    uint256 badTs = realTs + 1;

    vm.warp(max(block.timestamp, realTs));

    assembly {
      mstore(add(header, add(0x20, 0x01b4)), badTs)
    }

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidTimestamp.selector, realTs, badTs));
    rollup.propose(header, archive, data.blockHash, txHashes, signatures, body);
  }

  function testBlocksWithAssumeProven() public setUpFor("mixed_block_1") {
    rollup.setAssumeProvenThroughBlockNumber(1);
    assertEq(rollup.getPendingBlockNumber(), 0, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");

    _testBlock("mixed_block_1", false);
    _testBlock("mixed_block_2", false);

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 1, "Invalid proven block number");
  }

  function testSetAssumeProvenAfterBlocksProcessed() public setUpFor("mixed_block_1") {
    assertEq(rollup.getPendingBlockNumber(), 0, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 0, "Invalid proven block number");

    _testBlock("mixed_block_1", false);
    _testBlock("mixed_block_2", false);
    rollup.setAssumeProvenThroughBlockNumber(1);

    assertEq(rollup.getPendingBlockNumber(), 2, "Invalid pending block number");
    assertEq(rollup.getProvenBlockNumber(), 1, "Invalid proven block number");
  }

  function testSubmitProofNonExistantBlock() public setUpFor("empty_block_1") {
    _testBlock("empty_block_1", false);
    DecoderBase.Data memory data = load("empty_block_1").block;

    (bytes32 preArchive, bytes32 preBlockHash,) = rollup.blocks(0);
    bytes32 wrong = bytes32(uint256(0xdeadbeef));
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InvalidPreviousArchive.selector, preArchive, wrong)
    );
    _submitEpochProof(rollup, 1, wrong, data.archive, preBlockHash, data.blockHash, bytes32(0));

    // TODO: Reenable when we setup proper initial block hash
    // vm.expectRevert(
    //   abi.encodeWithSelector(Errors.Rollup__InvalidPreviousBlockHash.selector, preBlockHash, wrong)
    // );
    // _submitEpochProof(rollup, 1, preArchive, data.archive, wrong, data.blockHash, bytes32(0));
  }

  function testSubmitProofInvalidArchive() public setUpFor("empty_block_1") {
    _testBlock("empty_block_1", false);

    DecoderBase.Data memory data = load("empty_block_1").block;
    bytes32 wrongArchive = bytes32(uint256(0xdeadbeef));

    (bytes32 preArchive, bytes32 preBlockHash,) = rollup.blocks(0);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InvalidArchive.selector, data.archive, 0xdeadbeef)
    );
    _submitEpochProof(rollup, 1, preArchive, wrongArchive, preBlockHash, data.blockHash, bytes32(0));
  }

  function testSubmitProofInvalidBlockHash() public setUpFor("empty_block_1") {
    _testBlock("empty_block_1", false);

    DecoderBase.Data memory data = load("empty_block_1").block;
    bytes32 wrongBlockHash = bytes32(uint256(0xdeadbeef));

    (bytes32 preArchive, bytes32 preBlockHash,) = rollup.blocks(0);
    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InvalidBlockHash.selector, data.blockHash, wrongBlockHash
      )
    );
    _submitEpochProof(rollup, 1, preArchive, data.archive, preBlockHash, wrongBlockHash, bytes32(0));
  }

  function _quoteToSignedQuote(EpochProofQuoteLib.EpochProofQuote memory _quote)
    internal
    view
    returns (EpochProofQuoteLib.SignedEpochProofQuote memory)
  {
    bytes32 digest = rollup.quoteToDigest(_quote);
    (uint8 v, bytes32 r, bytes32 s) =
      vm.sign(0x123456789abcdef123456789abcdef123456789abcdef123456789abcdef1234, digest);
    return EpochProofQuoteLib.SignedEpochProofQuote({
      quote: _quote,
      signature: SignatureLib.Signature({isEmpty: false, v: v, r: r, s: s})
    });
  }

  function _testBlock(string memory name, bool _submitProof) public {
    _testBlock(name, _submitProof, 0);
  }

  function _testBlock(string memory name, bool _submitProof, uint256 _slotNumber) public {
    DecoderBase.Full memory full = load(name);
    bytes memory header = full.block.header;
    bytes32 archive = full.block.archive;
    bytes memory body = full.block.body;
    uint32 numTxs = full.block.numTxs;
    bytes32[] memory txHashes = new bytes32[](0);

    Slot slotNumber = Slot.wrap(_slotNumber);

    // Overwrite some timestamps if needed
    if (slotNumber != Slot.wrap(0)) {
      Timestamp ts = rollup.getTimestampForSlot(slotNumber);

      full.block.decodedHeader.globalVariables.timestamp = Timestamp.unwrap(ts);
      full.block.decodedHeader.globalVariables.slotNumber = Slot.unwrap(slotNumber);
      assembly {
        mstore(add(header, add(0x20, 0x0194)), slotNumber)
        mstore(add(header, add(0x20, 0x01b4)), ts)
      }
    }

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, full.block.decodedHeader.globalVariables.timestamp));

    _populateInbox(full.populate.sender, full.populate.recipient, full.populate.l1ToL2Content);

    rollup.propose(header, archive, full.block.blockHash, txHashes, signatures, body);

    if (_submitProof) {
      uint256 pre = rollup.getProvenBlockNumber();
      (bytes32 preArchive, bytes32 preBlockHash,) = rollup.blocks(pre);

      _submitEpochProof(
        rollup, 1, preArchive, archive, preBlockHash, full.block.blockHash, bytes32(0)
      );
      assertEq(pre + 1, rollup.getProvenBlockNumber(), "Block not proven");
    }

    bytes32 l2ToL1MessageTreeRoot;
    {
      // NB: The below works with full blocks because we require the largest possible subtrees
      // for L2 to L1 messages - usually we make variable height subtrees, the roots of which
      // form a balanced tree

      // The below is a little janky - we know that this test deals with full txs with equal numbers
      // of msgs or txs with no messages, so the division works
      // TODO edit full.messages to include information about msgs per tx?
      uint256 subTreeHeight = full.messages.l2ToL1Messages.length == 0
        ? 0
        : merkleTestUtil.calculateTreeHeightFromSize(full.messages.l2ToL1Messages.length / numTxs);
      uint256 outHashTreeHeight = merkleTestUtil.calculateTreeHeightFromSize(numTxs);
      uint256 numMessagesWithPadding = numTxs * Constants.MAX_L2_TO_L1_MSGS_PER_TX;

      uint256 treeHeight = subTreeHeight + outHashTreeHeight;
      NaiveMerkle tree = new NaiveMerkle(treeHeight);
      for (uint256 i = 0; i < numMessagesWithPadding; i++) {
        if (i < full.messages.l2ToL1Messages.length) {
          tree.insertLeaf(full.messages.l2ToL1Messages[i]);
        } else {
          tree.insertLeaf(bytes32(0));
        }
      }

      l2ToL1MessageTreeRoot = tree.computeRoot();
    }

    (bytes32 root,) = outbox.getRootData(full.block.decodedHeader.globalVariables.blockNumber);

    // If we are trying to read a block beyond the proven chain, we should see "nothing".
    if (rollup.getProvenBlockNumber() >= full.block.decodedHeader.globalVariables.blockNumber) {
      assertEq(l2ToL1MessageTreeRoot, root, "Invalid l2 to l1 message tree root");
    } else {
      assertEq(root, bytes32(0), "Invalid outbox root");
    }

    assertEq(rollup.archive(), archive, "Invalid archive");
  }

  function _populateInbox(address _sender, bytes32 _recipient, bytes32[] memory _contents) internal {
    for (uint256 i = 0; i < _contents.length; i++) {
      vm.prank(_sender);
      inbox.sendL2Message(
        DataStructures.L2Actor({actor: _recipient, version: 1}), _contents[i], bytes32(0)
      );
    }
  }

  function _submitEpochProof(
    Rollup _rollup,
    uint256 _epochSize,
    bytes32 _previousArchive,
    bytes32 _endArchive,
    bytes32 _previousBlockHash,
    bytes32 _endBlockHash,
    bytes32 _proverId
  ) internal {
    _submitEpochProofWithFee(
      _rollup,
      _epochSize,
      _previousArchive,
      _endArchive,
      _previousBlockHash,
      _endBlockHash,
      _proverId,
      address(0),
      uint256(0)
    );
  }

  function _submitEpochProofWithFee(
    Rollup _rollup,
    uint256 _epochSize,
    bytes32 _previousArchive,
    bytes32 _endArchive,
    bytes32 _previousBlockHash,
    bytes32 _endBlockHash,
    bytes32 _proverId,
    address _feeRecipient,
    uint256 _feeAmount
  ) internal {
    bytes32[7] memory args = [
      _previousArchive,
      _endArchive,
      _previousBlockHash,
      _endBlockHash,
      bytes32(0),
      bytes32(0),
      _proverId
    ];

    bytes32[] memory fees = new bytes32[](Constants.AZTEC_EPOCH_DURATION * 2);

    fees[0] = bytes32(uint256(uint160(_feeRecipient)));
    fees[1] = bytes32(_feeAmount);

    bytes memory aggregationObject = "";
    bytes memory proof = "";

    _rollup.submitEpochRootProof(_epochSize, args, fees, aggregationObject, proof);
  }
}
