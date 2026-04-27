// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {TEEPortal} from "@aztec/oxide/TEEPortal.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {TEEPortalBase} from "@test/oxide/TEEPortalBase.t.sol";

contract TEEPortalAddTeeTest is TEEPortalBase {
  function test_GivenPortalIsInitialized_WhenOwnerAddsTee() external givenPortalIsInitialized {
    // it should register the TEE
    // it should enqueue the L2 signer registration message
    address tee = address(0xA11);

    vm.expectEmit(true, false, false, false, address(portal));
    emit TeeAdded(tee, DUMMY_GRUMPKIN_X, DUMMY_GRUMPKIN_Y, bytes32(0), 0);

    vm.prank(OWNER);
    portal.addTee(tee, DUMMY_GRUMPKIN_X, DUMMY_GRUMPKIN_Y);

    assertTrue(portal.isRegisteredTee(tee));
    assertFalse(portal.isRegisteredTee(address(0xB12)));
    (bool registered, bytes32 x, bytes32 y) = portal.$teeBindings(tee);
    assertTrue(registered);
    assertEq(x, DUMMY_GRUMPKIN_X);
    assertEq(y, DUMMY_GRUMPKIN_Y);
  }

  function test_GivenCallerIsNotOwner_WhenAddTeeIsCalled() external givenPortalIsInitialized {
    // it should revert
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, USER));
    vm.prank(USER);
    portal.addTee(address(0xA11), DUMMY_GRUMPKIN_X, DUMMY_GRUMPKIN_Y);
  }

  function test_GivenPortalIsUninitialized_WhenAddTeeIsCalled() external {
    // it should revert
    vm.expectRevert(TEEPortal.Uninitialized.selector);
    vm.prank(OWNER);
    portal.addTee(address(0xA11), DUMMY_GRUMPKIN_X, DUMMY_GRUMPKIN_Y);
  }

  function test_GivenZeroTee_WhenAddTeeIsCalled() external givenPortalIsInitialized {
    // it should revert
    vm.expectRevert(TEEPortal.ZeroTee.selector);
    vm.prank(OWNER);
    portal.addTee(address(0), DUMMY_GRUMPKIN_X, DUMMY_GRUMPKIN_Y);
  }

  function test_GivenTeeIsAlreadyRegistered_WhenAddTeeIsCalled() external givenPortalIsInitialized {
    // it should revert
    address tee = address(0xA11);
    vm.prank(OWNER);
    portal.addTee(tee, DUMMY_GRUMPKIN_X, DUMMY_GRUMPKIN_Y);

    vm.expectRevert(TEEPortal.AlreadyRegistered.selector);
    vm.prank(OWNER);
    portal.addTee(tee, DUMMY_GRUMPKIN_X, DUMMY_GRUMPKIN_Y);
  }
}
