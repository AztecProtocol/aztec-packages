// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {TestBase} from "../base/Base.sol";

import {Timestamp, Slot} from "@aztec/core/libraries/TimeLib.sol";
import {
  ProposedHeader,
  ContentCommitment,
  GasFees
} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";
import {ProposedHeaderLib} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";

// Many of the structs in here match what you see in `header` but with very important exceptions!
// The order of variables is sorted alphabetically in the structs in here to work with the
// JSON cheatcodes.

contract DecoderBase is TestBase {
  using ProposedHeaderLib for ProposedHeader;

  // When I had data and messages as one combined struct it failed, but I can have this top-layer and it works :shrug:
  // Note: Members of the struct (and substructs) have to be in ALPHABETICAL order!
  struct Full {
    Data block;
    Messages messages;
    Populate populate;
  }

  struct AlphabeticalFull {
    AlphabeticalData block;
    Messages messages;
    Populate populate;
  }

  struct Populate {
    bytes32[] l1ToL2Content;
    bytes32 recipient;
    address sender;
  }

  struct Messages {
    bytes32[] l2ToL1Messages;
  }

  struct AlphabeticalContentCommitment {
    bytes32 blobsHash;
    bytes32 inHash;
    bytes32 outHash;
  }

  struct AlphabeticalHeader {
    address coinbase;
    AlphabeticalContentCommitment contentCommitment;
    bytes32 feeRecipient;
    GasFees gasFees;
    bytes32 lastArchiveRoot;
    uint256 slotNumber;
    uint256 timestamp;
    uint256 totalManaUsed;
  }

  struct Data {
    bytes32 archive;
    // Note: batchedBlobInputs is usually per epoch, rather than per block. For testing, these batchedBlobInputs assume that
    // an epoch contains blobs including and up to the 'current' block.
    // e.g. mixed_block_2's batchedBlobInputs assumes that the epoch consists of 2 blocks, mixed_block_1 and mixed_block_2, and their blobs.
    // e.g. mixed_block_1's batchedBlobInputs assumes the epoch contains only mixed_block_1 and its blob(s).
    bytes batchedBlobInputs; // EVM point evaluation precompile inputs for verifying an epoch's batch of blobs
    bytes blobCommitments; // [numBlobs, ...blobCommitments], used in proposing blocks
    uint256 blockNumber;
    bytes body;
    ProposedHeader header;
    bytes32 headerHash;
    uint32 numTxs;
  }

  struct AlphabeticalData {
    bytes32 archive;
    bytes batchedBlobInputs;
    bytes blobCommitments;
    uint256 blockNumber;
    bytes body;
    AlphabeticalHeader header;
    bytes32 headerHash;
    uint32 numTxs;
  }

  function load(string memory name) internal view returns (Full memory) {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/test/fixtures/", name, ".json");
    string memory json = vm.readFile(path);
    bytes memory jsonBytes = vm.parseJson(json);
    AlphabeticalFull memory full = abi.decode(jsonBytes, (AlphabeticalFull));
    return fromAlphabeticalToNormal(full);
  }

  // Decode does not support the custom types
  function fromAlphabeticalToNormal(AlphabeticalFull memory full)
    internal
    pure
    returns (Full memory)
  {
    Full memory result = Full({
      block: Data({
        archive: full.block.archive,
        blobCommitments: full.block.blobCommitments,
        batchedBlobInputs: full.block.batchedBlobInputs,
        blockNumber: full.block.blockNumber,
        body: full.block.body,
        header: ProposedHeader({
          lastArchiveRoot: full.block.header.lastArchiveRoot,
          contentCommitment: ContentCommitment({
            blobsHash: full.block.header.contentCommitment.blobsHash,
            inHash: full.block.header.contentCommitment.inHash,
            outHash: full.block.header.contentCommitment.outHash
          }),
          slotNumber: Slot.wrap(full.block.header.slotNumber),
          timestamp: Timestamp.wrap(full.block.header.timestamp),
          coinbase: full.block.header.coinbase,
          feeRecipient: full.block.header.feeRecipient,
          gasFees: full.block.header.gasFees,
          totalManaUsed: full.block.header.totalManaUsed
        }),
        headerHash: full.block.headerHash,
        numTxs: full.block.numTxs
      }),
      messages: full.messages,
      populate: full.populate
    });

    assertEq(
      result.block.headerHash, result.block.header.hash(), "headerHash mismatch when loading"
    );

    return result;
  }

  function max(uint256 a, uint256 b) internal pure returns (uint256) {
    return a > b ? a : b;
  }
}
