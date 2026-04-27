// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {TEEPortal} from "@aztec/oxide/TEEPortal.sol";
import {Ownable} from "@oz/access/Ownable.sol";
import {TEEPortalBase} from "@test/oxide/TEEPortalBase.t.sol";

contract TEEPortalInitializeTest is TEEPortalBase {
  function test_GivenPortalIsUninitialized_WhenOwnerInitializes() external {
    // it should bind the L2 bridge
    // it should emit Initialized
    vm.expectEmit(true, true, true, true, address(portal));
    emit Initialized(L2_BRIDGE);

    _initialize();

    assertEq(portal.$l2Bridge(), L2_BRIDGE);
    assertTrue(portal.$initialized());
  }

  function test_GivenPortalIsInitialized_WhenOwnerInitializesAgain() external givenPortalIsInitialized {
    // it should revert
    vm.expectRevert(TEEPortal.AlreadyInitialized.selector);
    vm.prank(OWNER);
    portal.initialize(L2_BRIDGE);
  }

  function test_GivenZeroBridge_WhenOwnerInitializes() external {
    // it should revert
    vm.expectRevert(TEEPortal.ZeroL2Bridge.selector);
    vm.prank(OWNER);
    portal.initialize(bytes32(0));
  }

  function test_GivenCallerIsNotOwner_WhenInitializeIsCalled() external {
    // it should revert
    vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, USER));
    vm.prank(USER);
    portal.initialize(L2_BRIDGE);
  }
}
