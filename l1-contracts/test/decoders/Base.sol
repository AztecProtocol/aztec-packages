// SPDX-License-Identifier: Apache-2.0
// Copyright 2023 Aztec Labs.
pragma solidity >=0.8.18;

import {Test} from "forge-std/Test.sol";

contract DecoderBase is Test {
  // When I had data and messages as one combined struct it failed, but I can have this top-layer and it works :shrug:
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
    // TODO(benejsan): Use HeaderDecoder.Header here?
    uint256 chainId;
    uint256 version;
    uint256 blockNumber;
    uint256 timestamp;
    bytes32 lastArchive;
    bytes32 archive;
    bytes header;
    bytes body;
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
