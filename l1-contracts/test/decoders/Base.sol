// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

// Many of the structs in here match what you see in `header` but with very important exceptions!
// The order of variables is sorted alphabetically in the structs in here to work with the
// JSON cheatcodes.

contract DecoderBase is Test {
  struct AppendOnlyTreeSnapshot {
    uint32 nextAvailableLeafIndex;
    bytes32 root;
  }

  // When I had data and messages as one combined struct it failed, but I can have this top-layer and it works :shrug:
  // Note: Members of the struct (and substructs) have to be in ALPHABETICAL order!
  struct Full {
    Data block;
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

  struct Data {
    bytes32 archive;
    bytes body;
    DecodedHeader decodedHeader;
    bytes header;
    // Note: The following could be decoded from body but having it explicitaly here makes tests more robust against
    // decoder changes
    uint32 numTxs;
    bytes32 publicInputsHash;
    bytes32 txsEffectsHash;
  }

  struct DecodedHeader {
    ContentCommitment contentCommitment;
    GlobalVariables globalVariables;
    AppendOnlyTreeSnapshot lastArchive;
    StateReference stateReference;
  }

  struct GasFees {
    uint256 feePerDaGas;
    uint256 feePerL2Gas;
  }

  struct GlobalVariables {
    uint256 blockNumber;
    uint256 chainId;
    address coinbase;
    bytes32 feeRecipient;
    GasFees gasFees;
    uint256 slotNumber;
    uint256 timestamp;
    uint256 version;
  }

  struct StateReference {
    AppendOnlyTreeSnapshot l1ToL2MessageTree;
    PartialStateReference partialStateReference;
  }

  struct ContentCommitment {
    bytes32 inHash;
    uint256 numTxs;
    bytes32 outHash;
    bytes32 txsEffectsHash;
  }

  struct PartialStateReference {
    AppendOnlyTreeSnapshot noteHashTree;
    AppendOnlyTreeSnapshot nullifierTree;
    AppendOnlyTreeSnapshot publicDataTree;
  }

  function load(string memory name) internal view returns (Full memory) {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/test/fixtures/", name, ".json");
    string memory json = vm.readFile(path);
    bytes memory jsonBytes = vm.parseJson(json);
    Full memory full = abi.decode(jsonBytes, (Full));
    return full;
  }

  function max(uint256 a, uint256 b) internal pure returns (uint256) {
    return a > b ? a : b;
  }
}
