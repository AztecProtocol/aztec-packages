// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract TestERC20TestBase is Test {
  // solhint-disable private-vars-leading-underscore
  TestERC20 internal testERC20;

  function setUp() external {
    testERC20 = new TestERC20("test", "TEST", address(this));
  }
}
