// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Timestamp} from "@aztec/core/libraries/TimeLib.sol";
import {ProposedHeader, ProposedHeaderLib} from "@aztec/core/libraries/rollup/ProposedHeaderLib.sol";

contract ProposedHeaderHashHarness {
  function hashBoth(ProposedHeader calldata _header) external pure returns (bytes32 memoryHash, bytes32 calldataHash) {
    ProposedHeader memory copiedHeader = _header;
    return (ProposedHeaderLib.hash(copiedHeader), ProposedHeaderLib.hashCalldata(_header));
  }
}

contract ProposedHeaderHashCalldataTest is Test {
  ProposedHeaderHashHarness internal immutable harness = new ProposedHeaderHashHarness();

  function testFuzz_HashCalldataMatchesMemory(ProposedHeader memory _header) public view {
    _header.timestamp = Timestamp.wrap(uint64(Timestamp.unwrap(_header.timestamp)));
    (bytes32 memoryHash, bytes32 calldataHash) = harness.hashBoth(_header);
    assertEq(calldataHash, memoryHash);
  }
}
