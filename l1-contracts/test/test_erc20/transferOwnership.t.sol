// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";

import {TestERC20TestBase} from "./base.t.sol";

// solhint-disable comprehensive-interface
// solhint-disable func-name-mixedcase

contract TransferOwnershipTest is TestERC20TestBase {
  modifier whenTheCallerIsNotTheOwner(address _caller) {
    vm.assume(_caller != testERC20.owner());
    vm.startPrank(_caller);
    _;
    vm.stopPrank();
  }

  function test_WhenTheCallerIsNotTheOwner(address _caller, address _newOwner)
    external
    whenTheCallerIsNotTheOwner(_caller)
  {
    // it reverts
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    testERC20.transferOwnership(_newOwner);
  }

  // solhint-disable-next-line ordering
  modifier whenTheCallerIsTheOwner() {
    vm.startPrank(testERC20.owner());
    _;
    vm.stopPrank();
  }

  function test_WhenTheNewOwnerIsTheZeroAddress() external whenTheCallerIsTheOwner {
    // it reverts
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
    testERC20.transferOwnership(address(0));
  }

  function test_WhenTheNewOwnerIsNotTheZeroAddress(address _newOwner)
    external
    whenTheCallerIsTheOwner
  {
    // it removes the old owner as a minter
    // it adds the new owner as a minter
    // it transfers the ownership to the new owner
    // it emits a OwnershipTransferred event
    address oldOwner = testERC20.owner();

    vm.assume(_newOwner != address(0));
    vm.expectEmit(true, true, true, true, address(testERC20));
    emit Ownable.OwnershipTransferred(testERC20.owner(), _newOwner);
    testERC20.transferOwnership(_newOwner);

    assertEq(testERC20.owner(), _newOwner);
    assertEq(testERC20.minters(_newOwner), true);
    if (_newOwner != oldOwner) {
      assertEq(testERC20.minters(oldOwner), false);
    }
  }
}
