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
import {AvailabilityOracle} from "../src/core/availability_oracle/AvailabilityOracle.sol";
import {NaiveMerkle} from "./merkle/Naive.sol";
import {MerkleTestUtil} from "./merkle/TestUtil.sol";

import {TxsDecoderHelper} from "./decoders/helpers/TxsDecoderHelper.sol";

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

  AvailabilityOracle internal availabilityOracle;

  function setUp() public virtual {
    registry = new Registry();
    availabilityOracle = new AvailabilityOracle();
    rollup = new Rollup(registry, availabilityOracle);
    inbox = Inbox(address(rollup.INBOX()));
    outbox = Outbox(address(rollup.OUTBOX()));

    registry.upgrade(address(rollup), address(inbox), address(outbox));

    merkleTestUtil = new MerkleTestUtil();
    txsHelper = new TxsDecoderHelper();
  }

  function testMixedBlock() public {
    _testBlock("mixed_block_0");
  }

  function testConsecutiveMixedBlocks() public {
    _testBlock("mixed_block_0");
    _testBlock("mixed_block_1");
  }

  function testEmptyBlock() public {
    _testBlock("empty_block_0");
  }

  function testConsecutiveEmptyBlocks() public {
    _testBlock("empty_block_0");
    _testBlock("empty_block_1");
  }

  function testRevertInvalidChainId() public {
    DecoderBase.Data memory data = load("empty_block_0").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes memory body = data.body;

    assembly {
      // TODO: Hardcoding offsets in the middle of tests is annoying to say the least.
      mstore(add(header, add(0x20, 0x0134)), 0x420)
    }

    availabilityOracle.publish(body);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidChainId.selector, 0x420, 31337));
    rollup.process(header, archive, bytes(""));
  }

  function testRevertInvalidVersion() public {
    DecoderBase.Data memory data = load("empty_block_0").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes memory body = data.body;

    assembly {
      mstore(add(header, add(0x20, 0x0154)), 0x420)
    }

    availabilityOracle.publish(body);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__InvalidVersion.selector, 0x420, 1));
    rollup.process(header, archive, bytes(""));
  }

  function testRevertTimestampInFuture() public {
    DecoderBase.Data memory data = load("empty_block_0").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes memory body = data.body;

    uint256 ts = block.timestamp + 1;
    assembly {
      mstore(add(header, add(0x20, 0x0194)), ts)
    }

    availabilityOracle.publish(body);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__TimestampInFuture.selector));
    rollup.process(header, archive, bytes(""));
  }

  function testRevertTimestampTooOld() public {
    DecoderBase.Data memory data = load("empty_block_0").block;
    bytes memory header = data.header;
    bytes32 archive = data.archive;
    bytes memory body = data.body;

    // Overwrite in the rollup contract
    vm.store(address(rollup), bytes32(uint256(1)), bytes32(uint256(block.timestamp)));

    availabilityOracle.publish(body);

    vm.expectRevert(abi.encodeWithSelector(Errors.Rollup__TimestampTooOld.selector));
    rollup.process(header, archive, bytes(""));
  }

  function _testBlock(string memory name) public {
    DecoderBase.Full memory full = load(name);
    bytes memory header = full.block.header;
    bytes32 archive = full.block.archive;
    bytes memory body = full.block.body;
    uint32 numTxs = full.block.numTxs;

    // We jump to the time of the block.
    vm.warp(full.block.decodedHeader.globalVariables.timestamp);

    _populateInbox(full.populate.sender, full.populate.recipient, full.populate.l1ToL2Content);

    availabilityOracle.publish(body);

    uint256 toConsume = inbox.toConsume();

    vm.record();
    rollup.process(header, archive, bytes(""));

    assertEq(inbox.toConsume(), toConsume + 1, "Message subtree not consumed");

    bytes32 l2ToL1MessageTreeRoot;
    {
      uint256 numTxsWithPadding = txsHelper.computeNumTxEffectsToPad(numTxs) + numTxs;
      uint256 numMessagesWithPadding = numTxsWithPadding * Constants.MAX_NEW_L2_TO_L1_MSGS_PER_TX;

      uint256 treeHeight = merkleTestUtil.calculateTreeHeightFromSize(numMessagesWithPadding);
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

    (bytes32 root,) = outbox.roots(full.block.decodedHeader.globalVariables.blockNumber);

    assertEq(l2ToL1MessageTreeRoot, root, "Invalid l2 to l1 message tree root");

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
