// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";

import {HeaderLibHelper} from "./helpers/HeaderLibHelper.sol";
import {Header} from "@aztec/core/libraries/rollup/HeaderLib.sol";

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
        assertEq(header.slotNumber, referenceHeader.slotNumber, "Invalid slot number");
        assertEq(header.timestamp, referenceHeader.timestamp, "Invalid timestamp");
        assertEq(header.coinbase, referenceHeader.coinbase, "Invalid coinbase");
        assertEq(
          header.gasFees.feePerL2Gas,
          referenceHeader.gasFees.feePerL2Gas,
          "Invalid gasFees.feePerL2Gas"
        );
        assertEq(
          header.gasFees.feePerDaGas,
          referenceHeader.gasFees.feePerDaGas,
          "Invalid gasFees.feePerDaGas"
        );
        assertEq(header.feeRecipient, referenceHeader.feeRecipient, "Invalid feeRecipient");
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

      assertEq(header.lastArchiveRoot, referenceHeader.lastArchiveRoot, "Invalid lastArchiveRoot");

      assertEq(header.totalManaUsed, referenceHeader.totalManaUsed, "Invalid totalManaUsed");
    }
    // The public inputs are computed based of these values, but not directly part of the decoding per say.
  }
}
