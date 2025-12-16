// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";

import {DeployAztecL1Contracts} from "../../script/deploy/DeployAztecL1Contracts.s.sol";

contract DeployAztecL1ContractsTest is Test {
  // Just exercise the code. It contains assertions internally.
  function test_SmokeTest() public {
    DeployAztecL1Contracts deployScript = new DeployAztecL1Contracts();
    deployScript.run();
  }
}
