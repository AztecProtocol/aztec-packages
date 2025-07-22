// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.27;

import {BN254G1} from "@aztec/governance/libraries/BN254G1.sol";
import {Constants} from "@aztec/core/libraries/ConstantsGen.sol";
import {Errors} from "@aztec/governance/libraries/Errors.sol";
import {IGovernance} from "@aztec/governance/interfaces/IGovernance.sol";
import {GovernanceBase} from "./governance/base.t.sol";

/**
 * @title GovernanceBLS
 * @notice Test contract for BLS public key functionality in Governance
 */
contract GovernanceBLS is GovernanceBase {
      // Valid G1 points on BN254 curve for testing
  uint256 internal constant VALID_X1 = 1;
  uint256 internal constant VALID_Y1 = 2;

  // Different valid G1 point (negation of generator point: y = p - 2)
  uint256 internal constant VALID_X2 = 1;
  uint256 internal constant VALID_Y2 = Constants.P - 2;

  address internal alice = makeAddr("alice");
  address internal bob = makeAddr("bob");

  // Invalid field elements for testing (values >= field modulus p are invalid)
  uint256 internal constant INVALID_X = Constants.P + 1;
  uint256 internal constant INVALID_Y = Constants.P + 1;

  uint256 internal constant NOT_ON_CURVE_X = 1;
  uint256 internal constant NOT_ON_CURVE_Y = 3; // (1,3) is not on BN254

  function setUp() public override {
    super.setUp();
  }

  function testRegisterBlsKeyValidKey() external {
    vm.prank(alice);

    vm.expectEmit(true, true, true, true);
    emit BlsKeyRegistered(alice, VALID_X1, VALID_Y1);

    governance.registerBlsKey(VALID_X1, VALID_Y1);

    assertTrue(governance.hasBlsKey(alice));

    BN254G1.G1Point memory key = governance.getBlsKey(alice);
    assertEq(key.x, VALID_X1);
    assertEq(key.y, VALID_Y1);
  }

  function testRegisterBlsKeyRevertWhenKeyAlreadyRegistered() external {
    vm.startPrank(alice);
    governance.registerBlsKey(VALID_X1, VALID_Y1);

    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__BlsKeyAlreadyRegistered.selector, alice));
    governance.registerBlsKey(VALID_X2, VALID_Y2);
    vm.stopPrank();
  }

  function testRegisterBlsKeyRevertWhenInvalidFieldElement() external {
    vm.prank(alice);

    vm.expectRevert(BN254G1.InvalidFieldElement.selector);
    governance.registerBlsKey(INVALID_X, INVALID_Y);
  }

  function testRegisterBlsKeyRevertWhenPointAtInfinity() external {
    vm.prank(alice);

    vm.expectRevert(BN254G1.PointAtInfinity.selector);
    governance.registerBlsKey(0, 0);
  }

  function testRegisterBlsKeyRevertWhenNotOnCurve() external {
    vm.prank(alice);

    vm.expectRevert(BN254G1.PointNotOnCurve.selector);
    governance.registerBlsKey(NOT_ON_CURVE_X, NOT_ON_CURVE_Y);
  }

  function testUpdateBlsKeyValidKey() external {
    vm.startPrank(alice);

    // First register a key
    governance.registerBlsKey(VALID_X1, VALID_Y1);

    // Then update it
    vm.expectEmit(true, true, true, true);
    emit BlsKeyUpdated(alice, VALID_X2, VALID_Y2);

    governance.updateBlsKey(VALID_X2, VALID_Y2);

    assertTrue(governance.hasBlsKey(alice));

    BN254G1.G1Point memory key = governance.getBlsKey(alice);
    assertEq(key.x, VALID_X2);
    assertEq(key.y, VALID_Y2);

    vm.stopPrank();
  }

  function testUpdateBlsKeyRevertWhenNoKeyRegistered() external {
    vm.prank(alice);

    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__BlsKeyNotRegistered.selector, alice));
    governance.updateBlsKey(VALID_X1, VALID_Y1);
  }

  function testUpdateBlsKeyRevertWhenInvalidKey() external {
    vm.startPrank(alice);

    governance.registerBlsKey(VALID_X1, VALID_Y1);

    vm.expectRevert(BN254G1.PointNotOnCurve.selector);
    governance.updateBlsKey(NOT_ON_CURVE_X, NOT_ON_CURVE_Y);

    vm.stopPrank();
  }

  function testUpdateBlsKeyRevertWhenKeyInUse() external {
    // Alice registers a key
    vm.prank(alice);
    governance.registerBlsKey(VALID_X1, VALID_Y1);

    // Bob registers a different key
    vm.prank(bob);
    governance.registerBlsKey(VALID_X2, VALID_Y2);

    // Alice tries to update to Bob's key (should revert)
    vm.prank(alice);
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__BlsKeyAlreadyInUse.selector, bob));
    governance.updateBlsKey(VALID_X2, VALID_Y2);
  }

  function testRemoveBlsKey() external {
    vm.startPrank(alice);

    // Register a key
    governance.registerBlsKey(VALID_X1, VALID_Y1);
    assertTrue(governance.hasBlsKey(alice));

    // Remove it
    vm.expectEmit(true, false, false, true);
    emit BlsKeyRemoved(alice);

    governance.removeBlsKey();

    assertFalse(governance.hasBlsKey(alice));

    BN254G1.G1Point memory key = governance.getBlsKey(alice);
    assertEq(key.x, 0);
    assertEq(key.y, 0);

    vm.stopPrank();
  }

  function testRemoveBlsKeyRevertWhenNoKeyRegistered() external {
    vm.prank(alice);

    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__BlsKeyNotRegistered.selector, alice));
    governance.removeBlsKey();
  }

  function testMultipleUsersCanRegisterDifferentKeys() external {
    // Alice registers a key
    vm.prank(alice);
    governance.registerBlsKey(VALID_X1, VALID_Y1);

    // Bob registers a different key
    vm.prank(bob);
    governance.registerBlsKey(VALID_X2, VALID_Y2);

    // Both should have keys registered
    assertTrue(governance.hasBlsKey(alice));
    assertTrue(governance.hasBlsKey(bob));

    // Keys should be different
    BN254G1.G1Point memory aliceKey = governance.getBlsKey(alice);
    BN254G1.G1Point memory bobKey = governance.getBlsKey(bob);

    assertEq(aliceKey.x, VALID_X1);
    assertEq(aliceKey.y, VALID_Y1);
    assertEq(bobKey.x, VALID_X2);
    assertEq(bobKey.y, VALID_Y2);
  }

  function testRegisterDuplicateKeyReverts() external {
    // Alice registers a key
    vm.prank(alice);
    governance.registerBlsKey(VALID_X1, VALID_Y1);

    // Bob tries to register the same key (should revert)
    vm.prank(bob);
    vm.expectRevert(abi.encodeWithSelector(Errors.Governance__BlsKeyAlreadyInUse.selector, alice));
    governance.registerBlsKey(VALID_X1, VALID_Y1);

    // Only Alice should have a key registered
    assertTrue(governance.hasBlsKey(alice));
    assertFalse(governance.hasBlsKey(bob));
  }

  function testGetBlsKeyReturnsZeroForUnregisteredUser() external {
    BN254G1.G1Point memory key = governance.getBlsKey(alice);
    assertEq(key.x, 0);
    assertEq(key.y, 0);
    assertFalse(governance.hasBlsKey(alice));
  }

  function testReRegisterAfterRemoval() external {
    vm.startPrank(alice);

    // Register, remove, then register again
    governance.registerBlsKey(VALID_X1, VALID_Y1);
    governance.removeBlsKey();
    governance.registerBlsKey(VALID_X2, VALID_Y2);

    assertTrue(governance.hasBlsKey(alice));

    BN254G1.G1Point memory key = governance.getBlsKey(alice);
    assertEq(key.x, VALID_X2);
    assertEq(key.y, VALID_Y2);

    vm.stopPrank();
  }

    function testRegisterTwoDifferentValidPoints() external {
    // Test with different valid points for two users (uniqueness required)

    // Alice registers first point
    vm.prank(alice);
    governance.registerBlsKey(VALID_X1, VALID_Y1);

    // Bob registers second point
    vm.prank(bob);
    governance.registerBlsKey(VALID_X2, VALID_Y2);

    // Verify both registrations
    assertTrue(governance.hasBlsKey(alice));
    assertTrue(governance.hasBlsKey(bob));

    BN254G1.G1Point memory aliceKey = governance.getBlsKey(alice);
    BN254G1.G1Point memory bobKey = governance.getBlsKey(bob);

    assertEq(aliceKey.x, VALID_X1);
    assertEq(aliceKey.y, VALID_Y1);
    assertEq(bobKey.x, VALID_X2);
    assertEq(bobKey.y, VALID_Y2);
  }

  // Events for testing
  event BlsKeyRegistered(address indexed account, uint256 indexed x, uint256 indexed y);
  event BlsKeyUpdated(address indexed account, uint256 indexed x, uint256 indexed y);
  event BlsKeyRemoved(address indexed account);
}
