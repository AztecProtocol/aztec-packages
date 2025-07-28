// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {KeyStorage, Keys, Validator} from "@aztec/governance/libraries/KeyStorage.sol";
import {KeyStorageHarness} from "./KeyStorageHarness.sol";

contract KeyStorageTest is Test {
  KeyStorageHarness internal h;

  address alice = address(0x1);

  uint256[2] internal pk1_alice = [
    0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef,
    0x2468acf13579bde02468acf13579bde02468acf13579bde02468acf13579bde0
  ];

  uint256[4] internal pk2_alice = [
    0x1111111111111111111111111111111111111111111111111111111111111111,
    0x2222222222222222222222222222222222222222222222222222222222222222,
    0x3333333333333333333333333333333333333333333333333333333333333333,
    0x4444444444444444444444444444444444444444444444444444444444444444
  ];

  // Test data for different users
  uint256[2] internal pk1_bob = [
    0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa,
    0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
  ];

  uint256[4] internal pk2_bob = [
    0x5555555555555555555555555555555555555555555555555555555555555555,
    0x6666666666666666666666666666666666666666666666666666666666666666,
    0x7777777777777777777777777777777777777777777777777777777777777777,
    0x8888888888888888888888888888888888888888888888888888888888888888
  ];

  function setUp() public {
    h = new KeyStorageHarness();
  }

  function test_InitialState() public view {
    assertEq(h.getValidatorsCount(), 0, "Should start with 0 validators");
    assertEq(h.getLiveIdsCount(), 0, "Should start with 0 live validators");
    assertEq(h.getIdOf(address(this)), 0, "Test contract should have no ID initially");
  }

  function test_AddFirstKey() public {
    h.addKey(pk1_alice, pk2_alice);

    // Check basic state
    assertEq(h.getValidatorsCount(), 1, "Should have 1 validator");
    assertEq(h.getLiveIdsCount(), 1, "Should have 1 live validator");

    // Check caller's ID
    uint32 callerId = h.getIdOf(address(this));
    assertEq(callerId, 1, "Caller should have ID 1");

    // Check validator data
    Validator memory validator = h.getValidator(callerId);
    assertEq(validator.g1x, pk1_alice[0], "G1x should match");
    assertEq(validator.g1y, pk1_alice[1], "G1y should match");
    assertEq(validator.g2x0, pk2_alice[0], "G2x0 should match");
    assertEq(validator.g2x1, pk2_alice[1], "G2x1 should match");
    assertEq(validator.g2y0, pk2_alice[2], "G2y0 should match");
    assertEq(validator.g2y1, pk2_alice[3], "G2y1 should match");
    assertTrue(validator.active, "Validator should be active");

    // Check active status
    assertTrue(h.isValidatorActive(callerId), "Caller should be active");

    // Check live IDs
    uint32[] memory liveIds = h.getLiveIds();
    assertEq(liveIds.length, 1, "Should have 1 live ID");
    assertEq(liveIds[0], callerId, "Live ID should be caller's ID");

    // Check position in live
    assertEq(h.getPositionInLive(callerId), 0, "Caller should be at position 0");
  }

  function test_SingleUserLifecycle() public {
    // Add key
    h.addKey(pk1_alice, pk2_alice);
    uint32 callerId = h.getIdOf(address(this));

    // Verify added
    assertEq(h.getValidatorsCount(), 1, "Should have 1 validator");
    assertEq(h.getLiveIdsCount(), 1, "Should have 1 live validator");
    assertTrue(h.isValidatorActive(callerId), "Should be active");

    // Deactivate
    h.deactivateKey();

    // Verify deactivated
    assertFalse(h.isValidatorActive(callerId), "Should be inactive");
    assertEq(h.getLiveIdsCount(), 0, "Should have 0 live validators");
    assertEq(h.getValidatorsCount(), 1, "Should still have 1 validator total");

    // Reactivate
    h.reactivateKey();

    // Verify reactivated
    assertTrue(h.isValidatorActive(callerId), "Should be active again");
    assertEq(h.getLiveIdsCount(), 1, "Should have 1 live validator");
  }

  function test_DeactivateKey() public {
    // Setup: Add key
    h.addKey(pk1_alice, pk2_alice);
    uint32 callerId = h.getIdOf(address(this));

    // Deactivate
    h.deactivateKey();

    // Check is inactive but still exists
    assertFalse(h.isValidatorActive(callerId), "Should be inactive");
    assertEq(h.getIdOf(address(this)), callerId, "Should still have same ID");
    assertEq(h.getValidatorsCount(), 1, "Should still have 1 validator total");
    assertEq(h.getLiveIdsCount(), 0, "Should have 0 live validators");

    // Check live IDs is empty
    uint32[] memory liveIds = h.getLiveIds();
    assertEq(liveIds.length, 0, "Live IDs should be empty");
  }

  function test_ReactivateKey() public {
    // Setup: Add and deactivate
    h.addKey(pk1_alice, pk2_alice);
    uint32 callerId = h.getIdOf(address(this));

    h.deactivateKey();

    // Verify deactivated state
    assertFalse(h.isValidatorActive(callerId), "Should be inactive");
    assertEq(h.getLiveIdsCount(), 0, "Should have 0 live validators");

    // Reactivate
    h.reactivateKey();

    // Check reactivated state
    assertTrue(h.isValidatorActive(callerId), "Should be active again");
    assertEq(h.getLiveIdsCount(), 1, "Should have 1 live validator");

    uint32[] memory liveIds = h.getLiveIds();
    assertEq(liveIds[0], callerId, "Should be back in live IDs");
    assertEq(h.getPositionInLive(callerId), 0, "Should be at position 0");
  }

  function test_CannotAddKeyTwice() public {
    h.addKey(pk1_alice, pk2_alice);

    vm.expectRevert(KeyStorage.KeyAlreadyRegistered.selector);
    h.addKey(pk1_alice, pk2_alice);
  }

  function test_CannotReuseSameKeysDifferentUser() public {
    // First user registers keys
    h.addKey(pk1_alice, pk2_alice);

    // Verify first user is registered
    uint32 firstUserId = h.getIdOf(address(this));
    assertEq(firstUserId, 1, "First user should have ID 1");
    assertTrue(h.isValidatorActive(firstUserId), "First user should be active");

    // Second user tries to register the same keys - should fail
    vm.expectRevert(KeyStorage.KeyAlreadyRegistered.selector);
    vm.prank(alice);
    h.addKey(pk1_alice, pk2_alice);

    // Verify second user was not registered
    assertEq(h.getIdOf(alice), 0, "Second user should have no ID");
    assertEq(h.getValidatorsCount(), 1, "Should still have only 1 validator");
    assertEq(h.getLiveIdsCount(), 1, "Should still have only 1 live validator");
  }

  function test_CannotReuseKeysAfterDeactivation() public {
    // First user registers and then deactivates keys
    h.addKey(pk1_alice, pk2_alice);
    uint32 firstUserId = h.getIdOf(address(this));

    h.deactivateKey();

    // Verify first user is deactivated but still owns the keys
    assertFalse(h.isValidatorActive(firstUserId), "First user should be inactive");
    assertEq(h.getIdOf(address(this)), firstUserId, "First user should still have their ID");

    // Second user tries to register the same keys - should still fail
    vm.expectRevert(KeyStorage.KeyAlreadyRegistered.selector);
    vm.prank(alice);
    h.addKey(pk1_alice, pk2_alice);

    // Verify the keys are permanently bound to the first user
    assertEq(h.getIdOf(alice), 0, "Second user should have no ID");
    assertEq(h.getValidatorsCount(), 1, "Should still have only 1 validator");
    assertEq(h.getLiveIdsCount(), 0, "Should have 0 live validators");
  }

  function test_DifferentUsersCanRegisterDifferentKeys() public {
    // First user registers their keys
    h.addKey(pk1_alice, pk2_alice);
    uint32 firstUserId = h.getIdOf(address(this));

    // Second user registers different keys - should succeed
    vm.prank(alice);
    h.addKey(pk1_bob, pk2_bob);
    uint32 secondUserId = h.getIdOf(alice);

    // Verify both users are registered with different IDs
    assertEq(firstUserId, 1, "First user should have ID 1");
    assertEq(secondUserId, 2, "Second user should have ID 2");

    // Verify both are active
    assertTrue(h.isValidatorActive(firstUserId), "First user should be active");
    assertTrue(h.isValidatorActive(secondUserId), "Second user should be active");

    // Verify total counts
    assertEq(h.getValidatorsCount(), 2, "Should have 2 validators");
    assertEq(h.getLiveIdsCount(), 2, "Should have 2 live validators");

    // Verify different key data is stored correctly
    Validator memory validator1 = h.getValidator(firstUserId);
    Validator memory validator2 = h.getValidator(secondUserId);

    assertEq(validator1.g1x, pk1_alice[0], "First user's G1x should match");
    assertEq(validator2.g1x, pk1_bob[0], "Second user's G1x should match");
    assertTrue(validator1.g1x != validator2.g1x, "Users should have different keys");
  }

  function test_CannotDeactivateUnregistered() public {
    vm.expectRevert(KeyStorage.NotValidator.selector);
    h.deactivateKey();
  }

  function test_CannotDeactivateAlreadyInactive() public {
    h.addKey(pk1_alice, pk2_alice);

    h.deactivateKey();

    vm.expectRevert(KeyStorage.AlreadyInactive.selector);
    h.deactivateKey();
  }

  function test_CannotReactivateUnregistered() public {
    vm.expectRevert(KeyStorage.NotValidator.selector);
    h.reactivateKey();
  }

  function test_CannotReactivateAlreadyActive() public {
    h.addKey(pk1_alice, pk2_alice);

    vm.expectRevert(KeyStorage.AlreadyActive.selector);
    h.reactivateKey();
  }

  function test_InvalidValidatorIdReverts() public {
    vm.expectRevert(KeyStorage.InvalidValidatorId.selector);
    h.getValidator(0); // ID 0 is invalid

    vm.expectRevert(KeyStorage.InvalidValidatorId.selector);
    h.getValidator(999); // Non-existent ID

    vm.expectRevert(KeyStorage.InvalidValidatorId.selector);
    h.isValidatorActive(0); // ID 0 is invalid

    vm.expectRevert(KeyStorage.InvalidValidatorId.selector);
    h.isValidatorActive(999); // Non-existent ID
  }

  function test_IdPersistenceAcrossStates() public {
    // Add key
    h.addKey(pk1_alice, pk2_alice);
    uint32 callerId = h.getIdOf(address(this));

    // Deactivate and check ID persists
    h.deactivateKey();
    assertEq(h.getIdOf(address(this)), callerId, "ID should persist after deactivation");

    // Reactivate and check ID persists
    h.reactivateKey();
    assertEq(h.getIdOf(address(this)), callerId, "ID should persist after reactivation");

    // Verify ID assignment starts from 1
    assertEq(callerId, 1, "First ID should be 1");
  }

  function test_LiveIdsPositionConsistency() public {
    // Add multiple validators
    h.addKey(pk1_alice, pk2_alice);
    uint32 id1 = h.getIdOf(address(this));

    vm.prank(alice);
    h.addKey(pk1_bob, pk2_bob);
    uint32 id2 = h.getIdOf(alice);

    // Verify positions match array indices
    assertEq(h.getPositionInLive(id1), 0, "First validator should be at position 0");
    assertEq(h.getPositionInLive(id2), 1, "Second validator should be at position 1");

    // Deactivate middle validator and verify positions update
    h.deactivateKey(); // Deactivate id1

    assertEq(h.getPositionInLive(id2), 0, "Second validator should move to position 0");
    assertEq(h.getPositionInLive(id1), 0, "Deactivated validator should have no position");
  }

  function test_IdAssignmentIsSequential() public {
    h.addKey(pk1_alice, pk2_alice);
    uint32 id1 = h.getIdOf(address(this));

    vm.prank(alice);
    h.addKey(pk1_bob, pk2_bob);
    uint32 id2 = h.getIdOf(alice);

    assertEq(id1, 1, "First ID should be 1");
    assertEq(id2, 2, "Second ID should be 2");

    // Even after deactivation/reactivation, IDs should remain
    h.deactivateKey();
    h.reactivateKey();
    assertEq(
      h.getIdOf(address(this)), id1, "ID should remain the same after deactivation/reactivation"
    );
  }

  function test_GetActiveValidatorsReflectsCurrentState() public {
    // Add validators
    h.addKey(pk1_alice, pk2_alice);
    vm.prank(alice);
    h.addKey(pk1_bob, pk2_bob);

    Validator[] memory active = h.getActiveValidators();
    assertEq(active.length, 2, "Should have 2 active validators");

    // Deactivate one
    h.deactivateKey();
    active = h.getActiveValidators();
    assertEq(active.length, 1, "Should have 1 active validator");
    assertEq(active[0].g1x, pk1_bob[0], "Remaining validator should be Bob's");

    // Reactivate
    h.reactivateKey();
    active = h.getActiveValidators();
    assertEq(active.length, 2, "Should have 2 active validators again");
  }

  function test_GetActiveValidators() public {
    // Test empty case
    Validator[] memory activeValidators = h.getActiveValidators();
    assertEq(activeValidators.length, 0, "Should have 0 active validators initially");

    // Add validator
    h.addKey(pk1_alice, pk2_alice);

    // Get active validators
    activeValidators = h.getActiveValidators();
    assertEq(activeValidators.length, 1, "Should have 1 active validator");

    // Check validator data
    assertEq(activeValidators[0].g1x, pk1_alice[0], "G1x should match");
    assertEq(activeValidators[0].g1y, pk1_alice[1], "G1y should match");
    assertTrue(activeValidators[0].active, "Should be active");

    // Deactivate and check
    h.deactivateKey();
    activeValidators = h.getActiveValidators();
    assertEq(activeValidators.length, 0, "Should have 0 active validators after deactivation");
  }

  function test_ValidatorDataIntegrity() public {
    // Test that validator data is stored correctly
    h.addKey(pk1_alice, pk2_alice);
    uint32 callerId = h.getIdOf(address(this));

    Validator memory validator = h.getValidator(callerId);

    // Verify all fields are stored correctly
    assertEq(validator.g1x, pk1_alice[0], "G1x should be stored correctly");
    assertEq(validator.g1y, pk1_alice[1], "G1y should be stored correctly");
    assertEq(validator.g2x0, pk2_alice[0], "G2x0 should be stored correctly");
    assertEq(validator.g2x1, pk2_alice[1], "G2x1 should be stored correctly");
    assertEq(validator.g2y0, pk2_alice[2], "G2y0 should be stored correctly");
    assertEq(validator.g2y1, pk2_alice[3], "G2y1 should be stored correctly");
    assertTrue(validator.active, "Should be active initially");

    // Deactivate and verify active flag changes
    h.deactivateKey();
    validator = h.getValidator(callerId);
    assertFalse(validator.active, "Should be inactive after deactivation");

    // But other data should remain unchanged
    assertEq(validator.g1x, pk1_alice[0], "G1x should remain unchanged");
    assertEq(validator.g1y, pk1_alice[1], "G1y should remain unchanged");
  }
}
