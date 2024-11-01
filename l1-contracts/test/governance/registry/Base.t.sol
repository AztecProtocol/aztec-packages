// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {Registry} from "@aztec/governance/Registry.sol";

contract RegistryBase is Test {
  Registry internal registry;

  function setUp() public {
    registry = new Registry(address(this));
  }
}
