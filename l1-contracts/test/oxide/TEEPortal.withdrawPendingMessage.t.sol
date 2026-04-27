// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {TEEPortal} from "@aztec/oxide/TEEPortal.sol";
import {Errors} from "@aztec/core/libraries/Errors.sol";
import {TEEPortalBase} from "@test/oxide/TEEPortalBase.t.sol";

contract TEEPortalWithdrawPendingMessageTest is TEEPortalBase {
  function test_GivenPortalIsNotFrozen_WhenWithdrawPendingMessageIsCalled() external givenPortalIsInitialized {
    // it should revert
    bytes32[] memory path = new bytes32[](0);

    vm.expectRevert(TEEPortal.NotFrozen.selector);
    portal.withdrawPendingMessage(USER, 1 ether, 0, 0, path, path, bytes32(0), "");
  }

  function test_GivenMessageIsInFreezeEpoch_WhenWithdrawPendingMessageIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-frozen")
  {
    // it should prove against the frozen out hash
    // it should consume through the outbox
    WithdrawParams memory p = _defaultWithdrawParams();
    p.epochNumber = 4;
    bytes32 messageHash = _messageHash(p.recipient, p.amount);
    _setCheckpoint(p.epochNumber, messageHash);
    _freezeAsOwner();

    bytes32[] memory path = new bytes32[](0);
    underlying.mint(address(portal), p.amount);
    uint256 userBalanceBefore = underlying.balanceOf(p.recipient);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    _withdrawPendingMessage(p, 0, path, path, sig);

    assertEq(underlying.balanceOf(p.recipient), userBalanceBefore + p.amount);
    assertTrue(portal.$isWithdrawalSpent(p.withdrawalDigest));

    assertEq(outbox.callCount(), 1);
    (,,,,, uint256 epoch, uint256 calledLeafIndex, uint256 pathLength) = outbox.calls(0);
    assertEq(epoch, p.epochNumber);
    assertEq(calledLeafIndex, 0);
    assertEq(pathLength, 0);
  }

  function test_GivenPortalWasFrozenAfterRollupReplacement_WhenWithdrawPendingMessageIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-frozen-replaced-rollup")
    givenRollupIsNonCanonical
  {
    // it should allow already-initiated withdrawals through the frozen outbox path
    WithdrawParams memory p = _defaultWithdrawParams();
    p.epochNumber = 4;
    bytes32 messageHash = _messageHash(p.recipient, p.amount);
    _setCheckpoint(p.epochNumber, messageHash);

    vm.prank(USER);
    portal.freeze();

    bytes32[] memory path = new bytes32[](0);
    underlying.mint(address(portal), p.amount);
    uint256 userBalanceBefore = underlying.balanceOf(p.recipient);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    _withdrawPendingMessage(p, 0, path, path, sig);

    assertEq(underlying.balanceOf(p.recipient), userBalanceBefore + p.amount);
    assertTrue(portal.$isWithdrawalSpent(p.withdrawalDigest));
    assertEq(outbox.callCount(), 1);
  }

  function test_GivenMessageIsBeforeFreezeEpoch_WhenWithdrawPendingMessageIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-frozen-previous-epoch")
  {
    // it should rely on the existing outbox root
    // it should not require a frozen path proof
    WithdrawParams memory p = _defaultWithdrawParams();
    p.epochNumber = 3;
    _setCheckpoint(4, bytes32(uint256(0xF3EE5E)));
    _freezeAsOwner();

    bytes32[] memory frozenPath = new bytes32[](0);
    bytes32[] memory currentPath = _dummyPath();
    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    _withdrawPendingMessage(p, p.leafIndex, frozenPath, currentPath, sig);

    assertEq(outbox.callCount(), 1);
    (,,,,, uint256 epoch, uint256 calledLeafIndex, uint256 pathLength) = outbox.calls(0);
    assertEq(epoch, p.epochNumber);
    assertEq(calledLeafIndex, p.leafIndex);
    assertEq(pathLength, currentPath.length);
  }

  function test_GivenMessageIsNotInFrozenOutHash_WhenWithdrawPendingMessageIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-frozen-root")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    p.epochNumber = 4;
    bytes32 frozenOutHash = bytes32(uint256(0xBADC0DE));
    _setCheckpoint(p.epochNumber, frozenOutHash);
    _freezeAsOwner();

    bytes32[] memory path = new bytes32[](0);
    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    bytes32 messageHash = _messageHash(p.recipient, p.amount);
    vm.expectRevert(
      abi.encodeWithSelector(Errors.MerkleLib__InvalidRoot.selector, frozenOutHash, messageHash, messageHash, 0)
    );
    _withdrawPendingMessage(p, 0, path, path, sig);
  }

  function test_GivenFreezeEpochPathsHaveDifferentLengths_WhenWithdrawPendingMessageIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-frozen-path")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    p.epochNumber = 4;
    bytes32 messageHash = _messageHash(p.recipient, p.amount);
    _setCheckpoint(p.epochNumber, messageHash);
    _freezeAsOwner();

    bytes32[] memory frozenPath = new bytes32[](0);
    bytes32[] memory currentPath = _dummyPath();
    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    vm.expectRevert(TEEPortal.FrozenPathLengthMismatch.selector);
    _withdrawPendingMessage(p, 0, frozenPath, currentPath, sig);
  }

  function test_GivenEpochIsAfterFreezeEpoch_WhenWithdrawPendingMessageIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-frozen-epoch")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    p.epochNumber = 5;
    bytes32[] memory path = new bytes32[](0);
    _freezeAsOwner();

    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    vm.expectRevert(TEEPortal.EpochAfterFreeze.selector);
    _withdrawPendingMessage(p, 0, path, path, sig);
  }

  function test_GivenFrozenWithdrawalDigestIsAlreadySpent_WhenWithdrawPendingMessageIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-frozen-replay")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    p.epochNumber = 4;
    bytes32 messageHash = _messageHash(p.recipient, p.amount);
    _setCheckpoint(p.epochNumber, messageHash);
    _freezeAsOwner();

    bytes32[] memory path = new bytes32[](0);
    underlying.mint(address(portal), p.amount * 2);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    _withdrawPendingMessage(p, 0, path, path, sig);

    vm.expectRevert(TEEPortal.WithdrawalAlreadyClaimed.selector);
    _withdrawPendingMessage(p, 0, path, path, sig);
  }
}
