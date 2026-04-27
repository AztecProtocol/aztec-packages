// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {TEEPortal} from "@aztec/oxide/TEEPortal.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {TEEPortalBase} from "@test/oxide/TEEPortalBase.t.sol";

contract TEEPortalWithdrawTest is TEEPortalBase {
  function test_GivenPortalIsUninitialized_WhenWithdrawIsCalled() external {
    // it should revert
    bytes32[] memory path = new bytes32[](0);

    vm.expectRevert(TEEPortal.Uninitialized.selector);
    portal.withdraw(USER, 1 ether, 0, 0, path, 0, bytes32(0), "");
  }

  function test_GivenValidWithdrawal_WhenWithdrawIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-happy")
  {
    // it should consume the outbox message
    // it should release escrowed tokens
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory path = _dummyPath();
    underlying.mint(address(portal), p.amount);
    uint256 userBalanceBefore = underlying.balanceOf(p.recipient);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    vm.expectEmit(true, true, true, true, address(portal));
    emit WithdrawFromAztec(p.recipient, p.amount);

    _withdraw(p, path, sig);

    assertEq(underlying.balanceOf(p.recipient), userBalanceBefore + p.amount);
    assertEq(underlying.balanceOf(address(portal)), 0);
    assertTrue(portal.$isWithdrawalSpent(p.withdrawalDigest));

    assertEq(outbox.callCount(), 1);
    (
      bytes32 senderActor,
      uint256 senderVersion,
      address recipientActor,
      uint256 recipientChainId,
      bytes32 content,
      uint256 epoch,
      uint256 calledLeafIndex,
      uint256 pathLength
    ) = outbox.calls(0);
    assertEq(senderActor, L2_BRIDGE);
    assertEq(senderVersion, ROLLUP_VERSION);
    assertEq(recipientActor, address(portal));
    assertEq(recipientChainId, block.chainid);
    bytes32 expectedContent =
      Hash.sha256ToField(abi.encodeWithSignature("withdraw(address,uint256)", p.recipient, p.amount));
    assertEq(content, expectedContent);
    assertEq(epoch, p.epochNumber);
    assertEq(calledLeafIndex, p.leafIndex);
    assertEq(pathLength, path.length);
  }

  function test_GivenWithdrawalDigestIsAlreadySpent_WhenWithdrawIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-replay")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory path = _dummyPath();
    underlying.mint(address(portal), p.amount * 2);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    _withdraw(p, path, sig);

    vm.expectRevert(TEEPortal.WithdrawalAlreadyClaimed.selector);
    _withdraw(p, path, sig);
  }

  function test_GivenSignerIsUnregistered_WhenWithdrawIsCalled() external givenPortalIsInitialized {
    // it should revert
    (, uint256 unregisteredPk) = makeAddrAndKey("tee-unreg");
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory path = _dummyPath();
    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(unregisteredPk, _finalDigest(p));

    vm.expectRevert(TEEPortal.UnregisteredTee.selector);
    _withdraw(p, path, sig);
  }

  function test_GivenRecipientWasTampered_WhenWithdrawIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-tamper-recipient")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory path = _dummyPath();
    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    vm.expectRevert(TEEPortal.UnregisteredTee.selector);
    portal.withdraw(
      address(0xBEEF), p.amount, p.epochNumber, p.leafIndex, path, p.checkpointNumber, p.withdrawalDigest, sig
    );
  }

  function test_GivenAmountWasTampered_WhenWithdrawIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-tamper-amount")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory path = _dummyPath();
    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    vm.expectRevert(TEEPortal.UnregisteredTee.selector);
    portal.withdraw(
      p.recipient, p.amount + 1, p.epochNumber, p.leafIndex, path, p.checkpointNumber, p.withdrawalDigest, sig
    );
  }

  function test_GivenWithdrawalDigestWasTampered_WhenWithdrawIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-tamper-digest")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory path = _dummyPath();
    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    vm.expectRevert(TEEPortal.UnregisteredTee.selector);
    portal.withdraw(
      p.recipient, p.amount, p.epochNumber, p.leafIndex, path, p.checkpointNumber, bytes32(uint256(0xFEEDFACE)), sig
    );
  }

  function test_GivenCheckpointNumberWasTampered_WhenWithdrawIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-tamper-anchor")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    uint256 tamperedCheckpointNumber = p.checkpointNumber + 1;
    rollup.setArchive(tamperedCheckpointNumber, bytes32(uint256(0xDECAFBAD)));
    rollup.setProvenCheckpointNumber(tamperedCheckpointNumber);

    bytes32[] memory path = _dummyPath();
    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    vm.expectRevert(TEEPortal.UnregisteredTee.selector);
    _withdrawWithCheckpoint(p, path, tamperedCheckpointNumber, sig);
  }

  function test_GivenCheckpointIsUnknown_WhenWithdrawIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-unknown-checkpoint")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory path = _dummyPath();
    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    vm.expectRevert(TEEPortal.UnknownCheckpoint.selector);
    _withdrawWithCheckpoint(p, path, p.checkpointNumber + 100, sig);
  }

  function test_GivenCheckpointIsUnproven_WhenWithdrawIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-unproven-checkpoint")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    uint256 unprovenCheckpointNumber = p.checkpointNumber + 1;
    rollup.setArchive(unprovenCheckpointNumber, p.archiveRoot);

    bytes32[] memory path = _dummyPath();
    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    vm.expectRevert(TEEPortal.UnprovenCheckpoint.selector);
    _withdrawWithCheckpoint(p, path, unprovenCheckpointNumber, sig);
  }

  function test_GivenOutboxReverts_WhenWithdrawIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-outbox-revert")
  {
    // it should bubble the outbox revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory path = _dummyPath();
    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _finalDigest(p));
    bytes memory customErr = abi.encodeWithSignature("OutboxReverted()");
    outbox.primeRevert(customErr);

    vm.expectRevert(customErr);
    _withdraw(p, path, sig);
  }

  function test_GivenPortalIsFrozen_WhenWithdrawIsCalled() external givenPortalIsInitialized givenPortalIsFrozen {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory path = _dummyPath();

    vm.expectRevert(TEEPortal.FrozenPortal.selector);
    _withdraw(p, path, "");
  }
}
