pragma solidity ^0.8.18;

import "forge-std/Test.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

contract TestERC20Test is Test {
  TestERC20 testERC20;

  function setUp() public {
    testERC20 = new TestERC20("test", "TEST", address(this));
  }

  function test_mint() public {
    testERC20.mint(address(this), 100);
    assertEq(testERC20.balanceOf(address(this)), 100);
  }

  function test_mint_only_owner(address _caller) public {
    vm.assume(_caller != address(this));
    vm.expectRevert();
    vm.prank(_caller);
    testERC20.mint(address(this), 100);
  }
}
