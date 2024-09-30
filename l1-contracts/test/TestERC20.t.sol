pragma solidity ^0.8.18;

import "forge-std/Test.sol";
import {TestERC20} from "./TestERC20.sol";

contract TestERC20Test is Test {
  TestERC20 testERC20;

  function setUp() public {
    testERC20 = new TestERC20();
  }

  function test_mint() public {
    testERC20.mint(address(this), 100);
    assertEq(testERC20.balanceOf(address(this)), 100);
  }
}
