// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {DecoderBase} from "../base/DecoderBase.sol";

// import {HeaderLibHelper} from "./helpers/HeaderLibHelper.sol";
import {Header, ContentCommitment} from "@aztec/core/libraries/rollup/HeaderLib.sol";

/**
 * Blocks are generated using the `integration_l1_publisher.test.ts` tests.
 * Main use of these test is shorter cycles when updating the decoder contract.
 * All tests here are skipped (all tests are prefixed with an underscore)!
 * This is because we implicitly test the decoding in integration_l1_publisher.test.ts
 */
contract DecodersTest is DecoderBase {
// function testDecodeBlocks() public {
//   _testDecodeBlock("mixed_block_1");
//   _testDecodeBlock("mixed_block_2");
//   _testDecodeBlock("empty_block_1");
//   _testDecodeBlock("empty_block_2");
// }

// function _testDecodeBlock(string memory name) public virtual {
//   DecoderBase.Full memory data = load(name);

//   // Header
//   {
//     Header memory header = headerHelper.decode(abi.encode(data.block.header));

//     // ContentCommitment
//     {
//       ContentCommitment memory contentCommitment = header.contentCommitment;

//       assertEq(header.contentCommitment.numTxs, contentCommitment.numTxs, "Invalid txTreeSize");
//       assertEq(
//         header.contentCommitment.blobsHash, contentCommitment.blobsHash, "Invalid blobHash"
//       );
//       assertEq(header.contentCommitment.inHash, contentCommitment.inHash, "Invalid inHash");
//       assertEq(header.contentCommitment.outHash, contentCommitment.outHash, "Invalid outHash");
//     }

//     assertEq(header.lastArchiveRoot, header.lastArchiveRoot, "Invalid lastArchiveRoot");

//     assertEq(header.totalManaUsed, header.totalManaUsed, "Invalid totalManaUsed");
//   }
//   // The public inputs are computed based of these values, but not directly part of the decoding per say.
// }
}
