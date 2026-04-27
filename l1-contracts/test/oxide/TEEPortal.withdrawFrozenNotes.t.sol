// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {TEEPortal} from "@aztec/oxide/TEEPortal.sol";
import {TEEPortalBase} from "@test/oxide/TEEPortalBase.t.sol";

contract TEEPortalWithdrawFrozenNotesTest is TEEPortalBase {
  function test_GivenPortalIsNotFrozen_WhenWithdrawFrozenNotesIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-forced-not-frozen")
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory nullifiers = _defaultForcedExitNullifiers();
    bytes memory proof = hex"c0ffee";
    bytes memory sig = _signTee(teePk, _forcedExitFinalDigest(p, nullifiers));

    vm.expectRevert(TEEPortal.NotFrozen.selector);
    _withdrawFrozenNotes(p, nullifiers, proof, sig);
  }

  function test_GivenValidFrozenNotesWithdrawal_WhenWithdrawFrozenNotesIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-forced")
    givenPortalIsFrozen
  {
    // it should verify the Noir proof against the frozen archive public inputs
    // it should mark the source nullifiers as spent
    // it should release escrowed tokens
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory nullifiers = _defaultForcedExitNullifiers();
    bytes memory proof = hex"c0ffee";
    bytes32[] memory publicInputs = _forcedExitPublicInputs(p.recipient, p.amount, nullifiers);
    assertEq(publicInputs.length, FORCED_EXIT_PUBLIC_INPUT_COUNT);
    assertEq(publicInputs[0], portal.$freezeArchive());
    assertEq(publicInputs[1], bytes32(p.amount));
    assertEq(publicInputs[2], bytes32(uint256(uint160(p.recipient))));
    assertEq(publicInputs[3], nullifiers[0]);
    assertEq(publicInputs[4], nullifiers[1]);
    assertEq(publicInputs[5], bytes32(0));
    assertEq(publicInputs[FORCED_EXIT_PUBLIC_INPUT_COUNT - 1], bytes32(0));
    forcedExitVerifier.setExpected(proof, publicInputs);

    underlying.mint(address(portal), p.amount);
    uint256 userBalanceBefore = underlying.balanceOf(p.recipient);
    bytes memory sig = _signTee(teePk, _forcedExitFinalDigest(p, nullifiers));

    vm.expectEmit(true, true, true, true, address(portal));
    emit WithdrawFromAztec(p.recipient, p.amount);

    _withdrawFrozenNotes(p, nullifiers, proof, sig);

    assertEq(underlying.balanceOf(p.recipient), userBalanceBefore + p.amount);
    assertTrue(portal.$isForcedExitNullifierSpent(nullifiers[0]));
    assertTrue(portal.$isForcedExitNullifierSpent(nullifiers[1]));
    assertFalse(portal.$isForcedExitNullifierSpent(bytes32(0)));
  }

  function test_GivenPortalWasFrozenAfterRollupReplacement_WhenWithdrawFrozenNotesIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-forced-replaced-rollup")
    givenRollupIsNonCanonical
  {
    // it should allow frozen-note withdrawals against the frozen archive
    vm.prank(USER);
    portal.freeze();

    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory nullifiers = _defaultForcedExitNullifiers();
    bytes memory proof = hex"c0ffee";
    bytes32[] memory publicInputs = _forcedExitPublicInputs(p.recipient, p.amount, nullifiers);
    forcedExitVerifier.setExpected(proof, publicInputs);

    underlying.mint(address(portal), p.amount);
    uint256 userBalanceBefore = underlying.balanceOf(p.recipient);
    bytes memory sig = _signTee(teePk, _forcedExitFinalDigest(p, nullifiers));

    _withdrawFrozenNotes(p, nullifiers, proof, sig);

    assertEq(underlying.balanceOf(p.recipient), userBalanceBefore + p.amount);
    assertTrue(portal.$isForcedExitNullifierSpent(nullifiers[0]));
    assertTrue(portal.$isForcedExitNullifierSpent(nullifiers[1]));
  }

  function test_GivenNoNullifiers_WhenWithdrawFrozenNotesIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-forced-empty")
    givenPortalIsFrozen
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory nullifiers = new bytes32[](0);
    bytes memory proof = hex"c0ffee";
    bytes memory sig = _signTee(teePk, _forcedExitFinalDigest(p, nullifiers));

    vm.expectRevert(TEEPortal.EmptyForcedExitNullifiers.selector);
    _withdrawFrozenNotes(p, nullifiers, proof, sig);
  }

  function test_GivenTooManyNullifiers_WhenWithdrawFrozenNotesIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-forced-too-many")
    givenPortalIsFrozen
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory nullifiers = new bytes32[](FORCED_EXIT_NULLIFIER_COUNT + 1);
    bytes memory proof = hex"c0ffee";
    bytes memory sig;

    vm.expectRevert(abi.encodeWithSelector(TEEPortal.TooManyForcedExitNullifiers.selector, nullifiers.length));
    _withdrawFrozenNotes(p, nullifiers, proof, sig);
  }

  function test_GivenZeroNullifier_WhenWithdrawFrozenNotesIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-forced-zero")
    givenPortalIsFrozen
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory nullifiers = _defaultForcedExitNullifiers();
    nullifiers[1] = bytes32(0);
    bytes memory proof = hex"c0ffee";
    bytes memory sig = _signTee(teePk, _forcedExitFinalDigest(p, nullifiers));

    vm.expectRevert(TEEPortal.ZeroForcedExitNullifier.selector);
    _withdrawFrozenNotes(p, nullifiers, proof, sig);
  }

  function test_GivenDuplicateNullifier_WhenWithdrawFrozenNotesIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-forced-duplicate")
    givenPortalIsFrozen
  {
    // it should revert before proof verification
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory nullifiers = _defaultForcedExitNullifiers();
    nullifiers[1] = nullifiers[0];
    bytes memory proof = hex"c0ffee";
    bytes memory sig;

    vm.expectRevert(abi.encodeWithSelector(TEEPortal.ForcedExitNullifierAlreadySpent.selector, nullifiers[0]));
    _withdrawFrozenNotes(p, nullifiers, proof, sig);

    assertFalse(portal.$isForcedExitNullifierSpent(nullifiers[0]));
  }

  function test_GivenVerifierRejectsProof_WhenWithdrawFrozenNotesIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-forced-invalid-proof")
    givenPortalIsFrozen
  {
    // it should revert without marking nullifiers
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory nullifiers = _defaultForcedExitNullifiers();
    bytes memory proof = hex"c0ffee";
    forcedExitVerifier.setShouldVerify(false);

    underlying.mint(address(portal), p.amount);
    bytes memory sig = _signTee(teePk, _forcedExitFinalDigest(p, nullifiers));

    vm.expectRevert(TEEPortal.InvalidForcedExitProof.selector);
    _withdrawFrozenNotes(p, nullifiers, proof, sig);

    assertFalse(portal.$isForcedExitNullifierSpent(nullifiers[0]));
  }

  function test_GivenTeeSignatureIsInvalid_WhenWithdrawFrozenNotesIsCalled()
    external
    givenPortalIsInitialized
    givenPortalIsFrozen
  {
    // it should revert
    (, uint256 unregisteredPk) = makeAddrAndKey("tee-forced-unregistered");
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory nullifiers = _defaultForcedExitNullifiers();
    bytes memory proof = hex"c0ffee";
    bytes32[] memory publicInputs = _forcedExitPublicInputs(p.recipient, p.amount, nullifiers);
    forcedExitVerifier.setExpected(proof, publicInputs);
    bytes memory sig = _signTee(unregisteredPk, _forcedExitFinalDigest(p, nullifiers));

    vm.expectRevert(TEEPortal.UnregisteredTee.selector);
    _withdrawFrozenNotes(p, nullifiers, proof, sig);
  }

  function test_GivenWithdrawalSignature_WhenWithdrawFrozenNotesIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-forced-wrong-domain")
    givenPortalIsFrozen
  {
    // it should reject signatures from the normal withdrawal finalization domain
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory nullifiers = _defaultForcedExitNullifiers();
    bytes memory proof = hex"c0ffee";
    bytes32[] memory publicInputs = _forcedExitPublicInputs(p.recipient, p.amount, nullifiers);
    forcedExitVerifier.setExpected(proof, publicInputs);
    bytes memory sig = _signTee(teePk, _finalDigest(p));

    vm.expectRevert(TEEPortal.UnregisteredTee.selector);
    _withdrawFrozenNotes(p, nullifiers, proof, sig);
  }

  function test_GivenNullifierIsAlreadySpent_WhenWithdrawFrozenNotesIsCalled()
    external
    givenPortalIsInitialized
    givenTeeIsRegistered("tee-forced-replay")
    givenPortalIsFrozen
  {
    // it should revert
    WithdrawParams memory p = _defaultWithdrawParams();
    bytes32[] memory nullifiers = _defaultForcedExitNullifiers();
    bytes memory proof = hex"c0ffee";
    bytes32[] memory publicInputs = _forcedExitPublicInputs(p.recipient, p.amount, nullifiers);
    forcedExitVerifier.setExpected(proof, publicInputs);

    underlying.mint(address(portal), p.amount * 2);
    bytes memory sig = _signTee(teePk, _forcedExitFinalDigest(p, nullifiers));
    _withdrawFrozenNotes(p, nullifiers, proof, sig);

    vm.expectRevert(abi.encodeWithSelector(TEEPortal.ForcedExitNullifierAlreadySpent.selector, nullifiers[0]));
    _withdrawFrozenNotes(p, nullifiers, proof, sig);
  }

  function _defaultForcedExitNullifiers() internal pure returns (bytes32[] memory nullifiers) {
    nullifiers = new bytes32[](2);
    nullifiers[0] = bytes32(uint256(0xA));
    nullifiers[1] = bytes32(uint256(0xB));
  }
}
