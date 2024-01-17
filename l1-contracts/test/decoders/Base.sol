// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

contract DecoderBase is Test {
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
    bytes32[] l1ToL2Messages;
    bytes32[] l2ToL1Messages;
  }

  struct Data {
    bytes32 archive;
    bytes body;
    bytes32 calldataHash;
    DecodedHeader decodedHeader;
    bytes header;
    bytes32 l1ToL2MessagesHash;
    bytes32 publicInputsHash;
  }

  struct DecodedHeader {
    bytes32 bodyHash;
    GlobalVariables globalVariables;
    uint256 lastArchiveNextAvailableLeafIndex;
    bytes32 lastArchiveRoot;
    StateReference stateReference;
  }

  struct GlobalVariables {
    uint256 blockNumber;
    uint256 chainId;
    uint256 timestamp;
    uint256 version;
  }

  struct StateReference {
    uint256 l1ToL2MessageTreeNextAvailableLeafIndex;
    bytes32 l1ToL2MessageTreeRoot;
    PartialStateReference partialStateReference;
  }

  struct PartialStateReference {
    uint256 contractTreeNextAvailableLeafIndex;
    bytes32 contractTreeRoot;
    uint256 noteHashTreeNextAvailableLeafIndex;
    bytes32 noteHashTreeRoot;
    uint256 nullifierTreeNextAvailableLeafIndex;
    bytes32 nullifierTreeRoot;
    uint256 publicDataTreeNextAvailableLeafIndex;
    bytes32 publicDataTreeRoot;
  }

  function load(string memory name) public view returns (Full memory) {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/test/fixtures/", name, ".json");
    string memory json = vm.readFile(path);
    bytes memory json_bytes = vm.parseJson(json);
    Full memory full = abi.decode(json_bytes, (Full));
    return full;
  }
}
