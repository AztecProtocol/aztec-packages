// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {Registry} from "@aztec/governance/Registry.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

contract FakeRollup {
  function getVersion() external view returns (uint256) {
    return uint256(keccak256(abi.encodePacked(bytes("aztec_rollup"), block.chainid, address(this))));
  }
}

contract RegistryBase is Test {
  Registry internal registry;

  function setUp() public virtual {
    TestERC20 asset = new TestERC20("test", "TEST", address(this));
    registry = new Registry(address(this), asset);
  }
}
