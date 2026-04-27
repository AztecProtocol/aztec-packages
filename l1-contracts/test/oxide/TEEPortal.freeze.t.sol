// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {TEEPortal} from "@aztec/oxide/TEEPortal.sol";
import {IHaveVersion} from "@aztec/governance/interfaces/IRegistry.sol";
import {TEEPortalBase} from "@test/oxide/TEEPortalBase.t.sol";

contract TEEPortalFreezeTest is TEEPortalBase {
  function test_GivenPortalIsUninitialized_WhenFreezeIsCalled() external {
    // it should revert
    vm.expectRevert(TEEPortal.Uninitialized.selector);
    vm.prank(OWNER);
    portal.freeze();
  }

  function test_GivenCallerIsOwner_WhenFreezeIsCalled() external givenPortalIsInitialized {
    // it should snapshot the proven checkpoint
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32 outHash = _messageHash(p.recipient, p.amount);
    _setCheckpoint(4, outHash);

    vm.expectEmit(true, true, true, true, address(portal));
    emit Frozen(DEFAULT_CHECKPOINT_NUMBER, 4, DEFAULT_ARCHIVE_ROOT, outHash);

    vm.prank(OWNER);
    portal.freeze();

    assertTrue(portal.$frozen());
    assertEq(portal.$freezeCheckpointNumber(), DEFAULT_CHECKPOINT_NUMBER);
    assertEq(portal.$freezeEpochNumber(), 4);
    assertEq(portal.$freezeArchive(), DEFAULT_ARCHIVE_ROOT);
    assertEq(portal.$freezeEpochOutHash(), outHash);
  }

  function test_GivenCallerIsNotOwnerAndRollupIsCanonical_WhenFreezeIsCalled() external givenPortalIsInitialized {
    // it should revert
    vm.expectRevert(TEEPortal.RollupStillCanonical.selector);
    vm.prank(USER);
    portal.freeze();
  }

  function test_GivenCallerIsNotOwnerAndRollupIsNonCanonical_WhenFreezeIsCalled()
    external
    givenPortalIsInitialized
    givenRollupIsNonCanonical
  {
    // it should freeze
    vm.prank(USER);
    portal.freeze();

    assertTrue(portal.$frozen());
  }

  function test_GivenPortalIsAlreadyFrozen_WhenFreezeIsCalled() external givenPortalIsInitialized givenPortalIsFrozen {
    // it should revert
    registry.setCanonicalRollup(IHaveVersion(address(0xBEEF)));

    vm.expectRevert(TEEPortal.AlreadyFrozen.selector);
    vm.prank(USER);
    portal.freeze();
  }
}
