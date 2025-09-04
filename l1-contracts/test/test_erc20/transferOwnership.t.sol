// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {Ownable} from "@oz/access/Ownable.sol";
import {Ownable2Step} from "@oz/access/Ownable2Step.sol";

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

  function test_WhenRecipientIsNotPending(address _caller) external {
    // it reverts

    vm.assume(_caller != address(0xdead));

    address oldOwner = testERC20.owner();

    vm.expectEmit(true, true, true, true, address(testERC20));
    emit Ownable2Step.OwnershipTransferStarted(oldOwner, address(0xdead));
    vm.prank(oldOwner);
    testERC20.transferOwnership(address(0xdead));

    vm.prank(_caller);
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, _caller));
    testERC20.acceptOwnership();
  }

  function test_WhenRecipientIsPending(address _newOwner) external {
    // it removes the old owner as a minter
    // it adds the new owner as a minter
    // it transfers the ownership to the new owner
    // it emits a OwnershipTransferred event

    address oldOwner = testERC20.owner();
    vm.assume(_newOwner != oldOwner);

    vm.expectEmit(true, true, true, true, address(testERC20));
    emit Ownable2Step.OwnershipTransferStarted(oldOwner, _newOwner);
    vm.prank(oldOwner);
    testERC20.transferOwnership(_newOwner);

    vm.expectEmit(true, true, true, true, address(testERC20));
    emit Ownable.OwnershipTransferred(oldOwner, _newOwner);
    vm.prank(_newOwner);
    testERC20.acceptOwnership();

    assertEq(testERC20.owner(), _newOwner);
    assertEq(testERC20.minters(_newOwner), true);
    assertEq(testERC20.minters(oldOwner), true);
  }
}
