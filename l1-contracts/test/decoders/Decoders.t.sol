// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "./Base.sol";

import {HeaderLibHelper} from "./helpers/HeaderLibHelper.sol";
import {Header} from "@aztec/core/libraries/RollupLibs/HeaderLib.sol";

/**
 * Blocks are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 * All tests here are skipped (all tests are prefixed with an underscore)!
 * This is because we implicitly test the decoding in integration_l1_publisher.test.ts
 */
contract DecodersTest is DecoderBase {
  HeaderLibHelper internal headerHelper;

  function setUp() public virtual {
    headerHelper = new HeaderLibHelper();
  }

  function testDecodeBlocks() public {
    _testDecodeBlock("mixed_block_1");
    _testDecodeBlock("mixed_block_2");
    _testDecodeBlock("empty_block_1");
    _testDecodeBlock("empty_block_2");
  }

  function _testDecodeBlock(string memory name) public virtual {
    DecoderBase.Full memory data = load(name);

    // Header
    {
      DecoderBase.DecodedHeader memory referenceHeader = data.block.decodedHeader;
      Header memory header = headerHelper.decode(data.block.header);

      // GlobalVariables
      {
        DecoderBase.GlobalVariables memory globalVariables = referenceHeader.globalVariables;

        assertEq(
          header.globalVariables.blockNumber, globalVariables.blockNumber, "Invalid block number"
        );
        assertEq(
          header.globalVariables.slotNumber, globalVariables.slotNumber, "Invalid slot number"
        );
        assertEq(header.globalVariables.chainId, globalVariables.chainId, "Invalid chain Id");
        assertEq(header.globalVariables.timestamp, globalVariables.timestamp, "Invalid timestamp");
        assertEq(header.globalVariables.version, globalVariables.version, "Invalid version");
        assertEq(header.globalVariables.coinbase, globalVariables.coinbase, "Invalid coinbase");
        assertEq(
          header.globalVariables.feeRecipient, globalVariables.feeRecipient, "Invalid feeRecipient"
        );
        assertEq(
          header.globalVariables.gasFees.feePerDaGas,
          globalVariables.gasFees.feePerDaGas,
          "Invalid gasFees.feePerDaGas"
        );
        assertEq(
          header.globalVariables.feeRecipient, globalVariables.feeRecipient, "Invalid feeRecipient"
        );
        assertEq(
          header.globalVariables.feeRecipient, globalVariables.feeRecipient, "Invalid feeRecipient"
        );
      }

      // ContentCommitment
      {
        DecoderBase.ContentCommitment memory contentCommitment = referenceHeader.contentCommitment;

        assertEq(header.contentCommitment.numTxs, contentCommitment.numTxs, "Invalid txTreeSize");
        assertEq(
          header.contentCommitment.blobsHash, contentCommitment.blobsHash, "Invalid blobHash"
        );
        assertEq(header.contentCommitment.inHash, contentCommitment.inHash, "Invalid inHash");
        assertEq(header.contentCommitment.outHash, contentCommitment.outHash, "Invalid outHash");
      }

      // StateReference
      {
        DecoderBase.StateReference memory stateReference = referenceHeader.stateReference;

        // L1 -> L2 messages
        assertEq(
          header.stateReference.l1ToL2MessageTree.nextAvailableLeafIndex,
          stateReference.l1ToL2MessageTree.nextAvailableLeafIndex,
          "Invalid l1ToL2MessageTree.nextAvailableLeafIndex"
        );
        assertEq(
          header.stateReference.l1ToL2MessageTree.root,
          stateReference.l1ToL2MessageTree.root,
          "Invalid l1ToL2MessageTree.root"
        );

        // PartialStateReference
        {
          DecoderBase.PartialStateReference memory partialStateReference =
            referenceHeader.stateReference.partialStateReference;

          // NoteHashTree
          assertEq(
            header.stateReference.partialStateReference.noteHashTree.nextAvailableLeafIndex,
            partialStateReference.noteHashTree.nextAvailableLeafIndex,
            "Invalid noteHashTree.nextAvailableLeafIndex"
          );
          assertEq(
            header.stateReference.partialStateReference.noteHashTree.root,
            partialStateReference.noteHashTree.root,
            "Invalid noteHashTree.root"
          );

          // NullifierTree
          assertEq(
            header.stateReference.partialStateReference.nullifierTree.nextAvailableLeafIndex,
            partialStateReference.nullifierTree.nextAvailableLeafIndex,
            "Invalid nullifierTree.nextAvailableLeafIndex"
          );
          assertEq(
            header.stateReference.partialStateReference.nullifierTree.root,
            partialStateReference.nullifierTree.root,
            "Invalid nullifierTree.root"
          );

          // PublicDataTree
          assertEq(
            header.stateReference.partialStateReference.publicDataTree.nextAvailableLeafIndex,
            partialStateReference.publicDataTree.nextAvailableLeafIndex,
            "Invalid publicDataTree.nextAvailableLeafIndex"
          );
          assertEq(
            header.stateReference.partialStateReference.publicDataTree.root,
            partialStateReference.publicDataTree.root,
            "Invalid publicDataTree.root"
          );
        }
      }

      assertEq(
        header.lastArchive.nextAvailableLeafIndex,
        referenceHeader.lastArchive.nextAvailableLeafIndex,
        "Invalid lastArchive.nextAvailableLeafIndex"
      );
      assertEq(
        header.lastArchive.root, referenceHeader.lastArchive.root, "Invalid lastArchive.root"
      );
    }
    // The public inputs are computed based of these values, but not directly part of the decoding per say.
  }
}
