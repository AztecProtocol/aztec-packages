pragma solidity ^0.8.18;

import "forge-std/Test.sol";
import {TestERC20} from "./TestERC20.sol";

contract TestERC20Test is Test {
  TestERC20 portalERC20;

  function setUp() public {
    portalERC20 = new TestERC20();
  }

  function test_mint() public {
    portalERC20.mint(address(this), 100);
    assertEq(portalERC20.balanceOf(address(this)), 100);
  }
}
