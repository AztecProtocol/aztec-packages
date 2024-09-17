// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {DecoderBase} from "./decoders/Base.sol";

import {DataStructures} from "../src/core/libraries/DataStructures.sol";
import {Constants} from "../src/core/libraries/ConstantsGen.sol";

import {Registry} from "../src/core/messagebridge/Registry.sol";
import {Inbox} from "../src/core/messagebridge/Inbox.sol";
import {Outbox} from "../src/core/messagebridge/Outbox.sol";
import {Errors} from "../src/core/libraries/Errors.sol";
import {Rollup} from "../src/core/Rollup.sol";
import {IFeeJuicePortal} from "../src/core/interfaces/IFeeJuicePortal.sol";
import {FeeJuicePortal} from "../src/core/FeeJuicePortal.sol";
import {Leonidas} from "../src/core/sequencer_selection/Leonidas.sol";
import {SignatureLib} from "../src/core/sequencer_selection/SignatureLib.sol";
import {NaiveMerkle} from "./merkle/Naive.sol";
import {MerkleTestUtil} from "./merkle/TestUtil.sol";
import {PortalERC20} from "./portals/PortalERC20.sol";

import {TxsDecoderHelper} from "./decoders/helpers/TxsDecoderHelper.sol";
import {IERC20Errors} from "@oz/interfaces/draft-IERC6093.sol";

/**
 * Blocks are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 */
contract RollupTest is DecoderBase {
  Registry internal registry;
  Inbox internal inbox;
  Outbox internal outbox;
  Rollup internal rollup;
  MerkleTestUtil internal merkleTestUtil;
  TxsDecoderHelper internal txsHelper;
  PortalERC20 internal portalERC20;
  FeeJuicePortal internal feeJuicePortal;

  SignatureLib.Signature[] internal signatures;

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
    portalERC20 = new PortalERC20();
    feeJuicePortal = new FeeJuicePortal(address(this));
    portalERC20.mint(address(feeJuicePortal), Constants.FEE_JUICE_INITIAL_MINT);
    feeJuicePortal.initialize(
      address(registry), address(portalERC20), bytes32(Constants.FEE_JUICE_ADDRESS)
    );
    rollup = new Rollup(
      registry,
      IFeeJuicePortal(address(feeJuicePortal)),
      bytes32(0),
      address(this),
      new address[](0)
    );
    inbox = Inbox(address(rollup.INBOX()));
    outbox = Outbox(address(rollup.OUTBOX()));

    registry.upgrade(address(rollup));

    merkleTestUtil = new MerkleTestUtil();
    txsHelper = new TxsDecoderHelper();
    _;
  }

  function testRevertProveTwice() public setUpFor("mixed_block_1") {
    DecoderBase.Data memory data = load("mixed_block_1").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes memory body = data.body;
    bytes32[] memory txHashes = new bytes32[](0);

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, data.decodedHeader.globalVariables.timestamp));

    rollup.propose(header, archive, bytes32(0), txHashes, signatures, body);

    rollup.submitBlockRootProof(header, archive, bytes32(0), "", "");

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NonSequentialProving.selector));
    rollup.submitBlockRootProof(header, archive, bytes32(0), "", "");
  }

  function testTimestamp() public setUpFor("mixed_block_1") {
    // Ensure that the timestamp of the current slot is never in the future.
    for (uint256 i = 0; i < 100; i++) {
      uint256 slot = rollup.getCurrentSlot();
      uint256 ts = rollup.getTimestampForSlot(slot);

      assertLe(ts, block.timestamp, "Invalid timestamp");

      vm.warp(block.timestamp + 12);
      vm.roll(block.number + 1);
    }
  }

  function testRevertPrune() public setUpFor("mixed_block_1") {
    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NothingToPrune.selector));
    rollup.prune();

    _testBlock("mixed_block_1", false);

    uint256 currentSlot = rollup.getCurrentSlot();
    (,, uint128 slot) = rollup.blocks(1);
    uint256 prunableAt = uint256(slot) + rollup.TIMELINESS_PROVING_IN_SLOTS();

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__NotReadyToPrune.selector, currentSlot, prunableAt)
    );
    rollup.prune();
  }

  function testPrune() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false);

    assertEq(inbox.inProgress(), 3, "Invalid in progress");

    // @note  Fetch the inbox root of block 2. This should be frozen when block 1 is proposed.
    //        Even if we end up reverting block 1, we should still see the same root in the inbox.
    bytes32 inboxRoot2 = inbox.getRoot(2);

    (,, uint128 slot) = rollup.blocks(1);
    uint256 prunableAt = uint256(slot) + rollup.TIMELINESS_PROVING_IN_SLOTS();

    uint256 timeOfPrune = rollup.getTimestampForSlot(prunableAt);
    vm.warp(timeOfPrune);

    assertEq(rollup.pendingBlockNum(), 1, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), 0, "Invalid proven block number");

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
    assertEq(rollup.pendingBlockNum(), 0, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), 0, "Invalid proven block number");

    // @note  We alter what slot is specified in the empty block!
    //        This means that we keep the `empty_block_1` mostly as is, but replace the slot number
    //        and timestamp as if it was created at a different point in time. This allow us to insert it
    //        as if it was the first block, even after we had originally inserted the mixed block.
    //        An example where this could happen would be if no-one could proof the mixed block.
    _testBlock("empty_block_1", false, prunableAt);

    assertEq(inbox.inProgress(), 3, "Invalid in progress");
    assertEq(inbox.getRoot(2), inboxRoot2, "Invalid inbox root");
    assertEq(rollup.pendingBlockNum(), 1, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), 0, "Invalid proven block number");

    // We check that the roots in the outbox have correctly been updated.
    bytes32 rootEmpty = vm.load(address(outbox), keccak256(abi.encode(1, 0)));
    uint256 minHeightEmpty =
      uint256(vm.load(address(outbox), bytes32(uint256(keccak256(abi.encode(1, 0))) + 1)));

    assertNotEq(rootEmpty, bytes32(0), "Invalid root");
    assertNotEq(minHeightEmpty, 0, "Invalid min height");
    assertNotEq(rootEmpty, rootMixed, "Invalid root");
    assertNotEq(minHeightEmpty, minHeightMixed, "Invalid min height");
  }

  function testBlockFee() public setUpFor("mixed_block_1") {
    uint256 feeAmount = 2e18;

    DecoderBase.Data memory data = load("mixed_block_1").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes memory body = data.body;
    bytes32[] memory txHashes = new bytes32[](0);

    // Progress time as necessary
    vm.warp(max(block.timestamp, data.decodedHeader.globalVariables.timestamp));

    assembly {
      mstore(add(header, add(0x20, 0x0248)), feeAmount)
    }

    assertEq(portalERC20.balanceOf(address(rollup)), 0, "invalid rollup balance");

    uint256 portalBalance = portalERC20.balanceOf(address(feeJuicePortal));

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, data.decodedHeader.globalVariables.timestamp));

    address coinbase = data.decodedHeader.globalVariables.coinbase;
    uint256 coinbaseBalance = portalERC20.balanceOf(coinbase);
    assertEq(coinbaseBalance, 0, "invalid initial coinbase balance");

    // Assert that balance have NOT been increased by proposing the block
    rollup.propose(header, archive, bytes32(0), txHashes, signatures, body);
    assertEq(portalERC20.balanceOf(coinbase), 0, "invalid coinbase balance");

    vm.expectRevert(
      abi.encodeWithSelector(
        IERC20Errors.ERC20InsufficientBalance.selector,
        address(feeJuicePortal),
        portalBalance,
        feeAmount
      )
    );
    rollup.submitBlockRootProof(header, archive, bytes32(0), "", "");
    assertEq(portalERC20.balanceOf(coinbase), 0, "invalid coinbase balance");

    portalERC20.mint(address(feeJuicePortal), feeAmount - portalBalance);

    // When the block is proven we should have received the funds
    rollup.submitBlockRootProof(header, archive, bytes32(0), "", "");
    assertEq(portalERC20.balanceOf(coinbase), feeAmount, "invalid coinbase balance");
  }

  function testMixedBlock(bool _toProve) public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", _toProve);

    assertEq(rollup.pendingBlockNum(), 1, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), _toProve ? 1 : 0, "Invalid proven block number");
  }

  function testConsecutiveMixedBlocks(uint256 _blocksToProve) public setUpFor("mixed_block_1") {
    uint256 toProve = bound(_blocksToProve, 0, 2);

    _testBlock("mixed_block_1", toProve > 0);
    _testBlock("mixed_block_2", toProve > 1);

    assertEq(rollup.pendingBlockNum(), 2, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), 0 + toProve, "Invalid proven block number");
  }

  function testConsecutiveMixedBlocksNonSequentialProof() public setUpFor("mixed_block_1") {
    _testBlock("mixed_block_1", false);

    DecoderBase.Data memory data = load("mixed_block_2").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes memory body = data.body;
    bytes32[] memory txHashes = new bytes32[](0);

    vm.warp(max(block.timestamp, data.decodedHeader.globalVariables.timestamp));
    rollup.propose(header, archive, bytes32(0), txHashes, signatures, body);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__NonSequentialProving.selector));
    rollup.submitBlockRootProof(header, archive, bytes32(0), "", "");

    assertEq(rollup.pendingBlockNum(), 2, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), 0, "Invalid proven block number");
  }

  function testEmptyBlock(bool _toProve) public setUpFor("empty_block_1") {
    _testBlock("empty_block_1", _toProve);
    assertEq(rollup.pendingBlockNum(), 1, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), _toProve ? 1 : 0, "Invalid proven block number");
  }

  function testConsecutiveEmptyBlocks(uint256 _blocksToProve) public setUpFor("empty_block_1") {
    uint256 toProve = bound(_blocksToProve, 0, 2);
    _testBlock("empty_block_1", toProve > 0);
    _testBlock("empty_block_2", toProve > 1);

    assertEq(rollup.pendingBlockNum(), 2, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), 0 + toProve, "Invalid proven block number");
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
    rollup.propose(header, archive, bytes32(0), txHashes, signatures, body);
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
    rollup.propose(header, archive, bytes32(0), txHashes, signatures, body);
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
    rollup.propose(header, archive, bytes32(0), txHashes, signatures, body);
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
    rollup.propose(header, archive, bytes32(0), txHashes, signatures, body);
  }

  function testBlocksWithAssumeProven() public setUpFor("mixed_block_1") {
    rollup.setAssumeProvenUntilBlockNumber(2);
    assertEq(rollup.pendingBlockNum(), 0, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), 0, "Invalid proven block number");

    _testBlock("mixed_block_1", false);
    _testBlock("mixed_block_2", false);

    assertEq(rollup.pendingBlockNum(), 2, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), 1, "Invalid proven block number");
  }

  function testSetAssumeProvenAfterBlocksProcessed() public setUpFor("mixed_block_1") {
    assertEq(rollup.pendingBlockNum(), 0, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), 0, "Invalid proven block number");

    _testBlock("mixed_block_1", false);
    _testBlock("mixed_block_2", false);
    rollup.setAssumeProvenUntilBlockNumber(2);

    assertEq(rollup.pendingBlockNum(), 2, "Invalid pending block number");
    assertEq(rollup.provenBlockNum(), 1, "Invalid proven block number");
  }

  function testSubmitProofNonExistantBlock() public setUpFor("empty_block_1") {
    DecoderBase.Data memory data = load("empty_block_1").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__TryingToProveNonExistingBlock.selector));
    rollup.submitBlockRootProof(header, archive, bytes32(0), "", "");
  }

  function testSubmitProofInvalidArchive() public setUpFor("empty_block_1") {
    _testBlock("empty_block_1", false);

    DecoderBase.Data memory data = load("empty_block_1").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;

    // Update the lastArchive value in the header and then submit a proof
    assembly {
      mstore(add(header, add(0x20, 0x00)), 0xdeadbeef)
    }

    vm.expectRevert(
      abi.encodeWithSelector(
        Errors.Rollup__InvalidArchive.selector, rollup.archiveAt(0), 0xdeadbeef
      )
    );
    rollup.submitBlockRootProof(header, archive, bytes32(0), "", "");
  }

  function testSubmitProofInvalidProposedArchive() public setUpFor("empty_block_1") {
    _testBlock("empty_block_1", false);

    DecoderBase.Data memory data = load("empty_block_1").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;

    bytes32 badArchive = keccak256(abi.encode(archive));

    vm.expectRevert(
      abi.encodeWithSelector(Errors.Rollup__InvalidProposedArchive.selector, archive, badArchive)
    );
    rollup.submitBlockRootProof(header, badArchive, bytes32(0), "", "");
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

    // Overwrite some timestamps if needed
    if (_slotNumber != 0) {
      uint256 ts = rollup.getTimestampForSlot(_slotNumber);

      full.block.decodedHeader.globalVariables.timestamp = ts;
      full.block.decodedHeader.globalVariables.slotNumber = _slotNumber;
      assembly {
        mstore(add(header, add(0x20, 0x0194)), _slotNumber)
        mstore(add(header, add(0x20, 0x01b4)), ts)
      }
    }

    // uint256 pendingBlockNum = rollup.pendingBlockNum();
    // full.block.decodedHeader.globalVariables.blockNumber = pendingBlockNum + 1;
    // assembly {
    //   mstore(add(header, add(0x20, 0x0174)), add(pendingBlockNum, 1))
    // }

    // We jump to the time of the block. (unless it is in the past)
    vm.warp(max(block.timestamp, full.block.decodedHeader.globalVariables.timestamp));

    _populateInbox(full.populate.sender, full.populate.recipient, full.populate.l1ToL2Content);

    rollup.propose(header, archive, bytes32(0), txHashes, signatures, body);

    if (_submitProof) {
      uint256 pre = rollup.provenBlockNum();

      rollup.submitBlockRootProof(header, archive, bytes32(0), "", "");

      assertEq(pre + 1, rollup.provenBlockNum(), "Block not proven");
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
    if (rollup.provenBlockNum() >= full.block.decodedHeader.globalVariables.blockNumber) {
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
}
