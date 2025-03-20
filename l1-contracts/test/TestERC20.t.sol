// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract TestERC20Test is Test {
  TestERC20 internal testERC20;

  function setUp() public {
    testERC20 = new TestERC20("test", "TEST", address(this));
  }

  function test_addRemoveMinter(address _minter) public {
    vm.assume(_minter != address(this));
    vm.assume(_minter != address(0));

    vm.prank(address(_minter));
    vm.expectRevert();
    testERC20.mint(address(this), 100);

    vm.expectEmit();
    emit TestERC20.MinterAdded(_minter);
    testERC20.addMinter(address(_minter));

    vm.prank(address(_minter));
    testERC20.mint(address(this), 100);

    vm.expectEmit();
    emit TestERC20.MinterRemoved(_minter);
    testERC20.removeMinter(address(_minter));

    vm.prank(address(_minter));
    vm.expectRevert();
    testERC20.mint(address(this), 100);
  }

  function test_onlyOwnerCanAddRemoveMinter(address _minter, address _caller) public {
    vm.assume(_minter != address(this));
    vm.assume(_minter != address(0));

    vm.assume(_caller != address(_minter));
    vm.assume(_caller != address(this));
    vm.assume(_caller != address(0));

    vm.prank(address(_caller));
    vm.expectRevert();
    testERC20.addMinter(address(_minter));

    testERC20.addMinter(address(_minter));

    vm.prank(address(_caller));
    vm.expectRevert();
    testERC20.removeMinter(address(_minter));
  }

  function test_mint() public {
    testERC20.mint(address(this), 100);
    assertEq(testERC20.balanceOf(address(this)), 100);
  }

  function test_transferOwnership(address _newOwner) public {
    vm.assume(_newOwner != address(this));
    vm.assume(_newOwner != address(0));

    address oldOwner = testERC20.owner();

    vm.prank(_newOwner);
    vm.expectRevert();
    testERC20.transferOwnership(address(_newOwner));

    testERC20.transferOwnership(address(_newOwner));
    assertEq(testERC20.owner(), address(_newOwner));

    vm.expectRevert();
    vm.prank(oldOwner);
    testERC20.mint(address(this), 100);

    vm.prank(address(_newOwner));
    testERC20.mint(address(this), 100);
  }

  function test_cannotTransferOwnershipToZeroAddress() public {
    vm.expectRevert();
    testERC20.transferOwnership(address(0));
  }
}
