// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {FeeAssetHandler} from "@aztec/mock/FeeAssetHandler.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract FeeAssetHandlerTestBase is Test {
  TestERC20 internal testERC20;
  FeeAssetHandler internal feeAssetHandler;

  function setUp() external {
    testERC20 = new TestERC20("test", "TEST", address(this));
    feeAssetHandler = new FeeAssetHandler(address(this), address(testERC20), 100);
    testERC20.addMinter(address(feeAssetHandler));
  }
}
