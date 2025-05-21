// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {Forwarder} from "../src/periphery/Forwarder.sol";
import {IForwarder} from "../src/periphery/interfaces/IForwarder.sol";
import {TestERC20} from "@aztec/mock/TestERC20.sol";
import {Ownable} from "@oz/access/Ownable.sol";
// solhint-disable comprehensive-interface

contract ForwarderTest is Test {
  Forwarder public forwarder;
  TestERC20 public token1;
  TestERC20 public token2;
  address public owner;
  address public user;

  function setUp() public {
    owner = makeAddr("owner");
    user = makeAddr("user");

    forwarder = new Forwarder();

    token1 = new TestERC20("Token1", "TK1", address(forwarder));
    token2 = new TestERC20("Token2", "TK2", address(forwarder));
  }

  function testForward() public {
    // Setup test data
    address[] memory targets = new address[](2);
    targets[0] = address(token1);
    targets[1] = address(token2);

    bytes[] memory data = new bytes[](2);
    data[0] = abi.encodeCall(TestERC20.mint, (address(this), 100));
    data[1] = abi.encodeCall(TestERC20.mint, (address(this), 200));

    // Execute forward call
    vm.prank(owner);
    forwarder.forward(targets, data);

    // Verify results
    assertEq(token1.balanceOf(address(this)), 100);
    assertEq(token2.balanceOf(address(this)), 200);
  }

  function testRevertWhenLengthMismatch() public {
    address[] memory targets = new address[](2);
    bytes[] memory data = new bytes[](1);

    vm.expectRevert(abi.encodeWithSelector(IForwarder.ForwarderLengthMismatch.selector, 2, 1));
    forwarder.forward(targets, data);
  }

  function testRevertWhenCallToInvalidAddress(address _invalidAddress) public {
    vm.assume(_invalidAddress.code.length == 0);
    vm.assume(uint160(_invalidAddress) > uint160(0x0a));

    address[] memory targets = new address[](1);
    targets[0] = _invalidAddress;

    bytes[] memory data = new bytes[](1);
    data[0] = hex"12345678";

    vm.expectRevert();
    forwarder.forward(targets, data);
  }
}
