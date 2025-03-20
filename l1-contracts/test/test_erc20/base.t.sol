// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract TestERC20TestBase is Test {
  TestERC20 internal testERC20;

  modifier whenTheCallerIsTheOwner() {
    vm.startPrank(testERC20.owner());
    _;
    vm.stopPrank();
  }

  modifier whenTheCallerIsNotTheOwner(address _caller) {
    vm.assume(_caller != testERC20.owner());
    vm.startPrank(_caller);
    _;
    vm.stopPrank();
  }

  function setUp() external {
    testERC20 = new TestERC20("test", "TEST", address(this));
  }
}
