// SPDX-License-Identifier: Apache-2.0
pragma solidity >=0.8.27;

import {TEEPortal} from "@aztec/oxide/TEEPortal.sol";
import {Caps} from "@aztec/oxide/Caps.sol";
import {Hash} from "@aztec/core/libraries/crypto/Hash.sol";
import {TEEPortalBase} from "@test/oxide/TEEPortalBase.t.sol";

contract TEEPortalDepositTest is TEEPortalBase {
  function test_GivenPortalIsUninitialized_WhenDepositIsCalled() external {
    // it should revert
    vm.expectRevert(TEEPortal.Uninitialized.selector);
    vm.prank(USER);
    portal.deposit(bytes32(uint256(1)), 10 ether, "");
  }

  function test_GivenPredicateRejectsCaller_WhenDepositIsCalled() external givenPortalIsInitialized {
    // it should revert
    predicate.setShouldPass(false);

    vm.expectRevert(TEEPortal.PredicateFailed.selector);
    vm.prank(USER);
    portal.deposit(bytes32(uint256(1)), 10 ether, "");
  }

  function test_GivenAmountExceedsTxLimit_WhenDepositIsCalled() external givenPortalIsInitialized {
    // it should revert
    vm.expectRevert(Caps.TxLimitSurpassed.selector);
    vm.prank(USER);
    portal.deposit(bytes32(uint256(1)), TX_LIMIT + 1, "");
  }

  function test_GivenPortalIsInitialized_WhenDepositIsCalled() external givenPortalIsInitialized {
    // it should escrow tokens
    // it should enqueue a claim message
    bytes32 recipientHash = bytes32(uint256(0xDEADBEEF));
    uint256 amount = 100 ether;
    bytes32 expectedContentHash =
      Hash.sha256ToField(abi.encodeWithSignature("claim(bytes32,uint256)", recipientHash, amount));
    bytes32 primedKey = bytes32(uint256(0x1234));
    uint256 primedIndex = 42;
    inbox.primeNext(primedKey, primedIndex);

    uint256 userBalanceBefore = underlying.balanceOf(USER);

    vm.expectEmit(true, true, true, true, address(portal));
    emit Deposit(recipientHash, amount, primedKey, primedIndex);

    vm.prank(USER);
    (bytes32 key, uint256 index) = portal.deposit(recipientHash, amount, "");

    assertEq(key, primedKey);
    assertEq(index, primedIndex);
    assertEq(underlying.balanceOf(USER), userBalanceBefore - amount);
    assertEq(underlying.balanceOf(address(portal)), amount);

    assertEq(inbox.callCount(), 1);
    (bytes32 recipientActor, uint256 recipientVersion, bytes32 contentHash, bytes32 secretHash) = inbox.calls(0);
    assertEq(recipientActor, L2_BRIDGE);
    assertEq(recipientVersion, ROLLUP_VERSION);
    assertEq(contentHash, expectedContentHash);
    assertEq(secretHash, portal.CONSTANT_SECRET_HASH());
    assertEq(portal.getCurrentAvailable(), GLOBAL_LIMIT - amount);
  }

  function test_GivenPortalIsFrozen_WhenDepositIsCalled() external givenPortalIsInitialized givenPortalIsFrozen {
    // it should revert
    vm.expectRevert(TEEPortal.FrozenPortal.selector);
    vm.prank(USER);
    portal.deposit(bytes32(uint256(1)), 10 ether, "");
  }
}
