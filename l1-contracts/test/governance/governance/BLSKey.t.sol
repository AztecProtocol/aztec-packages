// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {GovernanceBase} from "./base.t.sol";
import {BLS} from "@aztec/governance/libraries/BLS.sol";
import {console} from "forge-std/console.sol";

contract BLSKeyTest is GovernanceBase {
  uint256 private sk = 0x777777;

  // Events from IGovernance interface
  event BlsKeyActivated(address indexed account);
  event BlsKeyDeactivated(address indexed account);

  function createSigmaInit() public returns (uint256[2] memory) {
    uint256[2] memory pk1 = BLS.ecMul([BLS.G1x, BLS.G1y], sk);
    bytes memory g1Bytes = abi.encodePacked(pk1[0], pk1[1]);

    uint256[2] memory htilde = BLS.hashToPoint(BLS.DST_INIT, g1Bytes);
    uint256[2] memory sigma_init = BLS.ecMul(pk1, sk);
    return sigma_init;
  }

  function testCreateSigmaInit() public {
    uint256[2] memory sigma_init = createSigmaInit();
    console.log("Sigma Init:");
    console.log("x: ", sigma_init[0]);
    console.log("y: ", sigma_init[1]);
  }

  // Test that hash-to-curve works with valid G1 generator point
  function testHashToCurveWithValidPoint() public {
    // Generate Public Key
    uint256[2] memory pk1 = BLS.ecMul([BLS.G1x, BLS.G1y], sk);
    bytes memory g1Bytes = abi.encodePacked(pk1[0], pk1[1]);

    // Hash to point using the same domain separator as TypeScript
    uint256[2] memory htilde = BLS.hashToPoint(BLS.DST_INIT, g1Bytes);

    console.log("Hash-to-curve result:");
    console.log("  h_x:", htilde[0]);
    console.log("  h_y:", htilde[1]);

    // Verify the result is non-zero
    assertTrue(htilde[0] != 0 || htilde[1] != 0, "Hash result should not be point at infinity");
  }

  // Test registration and deletion with real keys
  function testRegisterAndDeleteKey() public {
    address user = makeAddr("validator_user");

    // G1 point
    uint256[2] memory Pk1 = [
      21717111607827114147276344786046920387290675681213477654336619089827402838378,
      2284104019570289860000481685722088619678108421648114428582946454571473581584
    ];

    // G2 point
    uint256[4] memory Pk2 = [
      18663079330489865128845570105108757938181330396697812001566207000632424769081,
      14571435474241611695300919538597266420395517375423464211930881122598088956678,
      9442315018389348105139497347757034195427809318621404724370443269827209466010,
      6846004404907068037004411600492877286139650973187007866352235233180481805142
    ];

    //
    uint256[2] memory SigmaInit = [
      20165597007245043796795825106968154870794832530122914927476441035915815919378,
      10367646492375003587862060159060425453381164888770702932580525893979805847893
    ];

    // Sanity Check
    BLS.pairingPublicKeys(
      Pk1, [BLS.nG2x0, BLS.nG2x1, BLS.nG2y0, BLS.nG2y1], [BLS.G1x, BLS.G1y], Pk2
    );

    vm.startPrank(user);

    // Verify no key is registered initially
    assertEq(governance.getIdOf(user), 0, "Should have no key initially");

    // Register the key and verify registration
    vm.expectEmit(true, false, false, false);
    emit BlsKeyActivated(user);
    governance.registerKey(Pk1, Pk2, SigmaInit);

    uint32 keyId = governance.getIdOf(user);
    assertTrue(keyId != 0, "Key should be registered");
    assertTrue(governance.isValidatorActive(keyId), "Key should be active");

    // Try to register the same key again (should fail)
    vm.expectRevert("key already registered");
    governance.registerKey(Pk1, Pk2, SigmaInit);

    // Remove the key and verify deactivation
    vm.expectEmit(true, false, false, false);
    emit BlsKeyDeactivated(user);
    governance.deactivateKey();

    // Key ID should remain the same, but should be inactive
    assertEq(governance.getIdOf(user), keyId, "Key ID should remain the same");
    assertFalse(governance.isValidatorActive(keyId), "Key should be inactive");

    // Try to remove the key again (should fail since it's already inactive)
    vm.expectRevert("already inactive");
    governance.deactivateKey();

    // Try to register again after removal (should work)
    vm.expectEmit(true, false, false, false);
    emit BlsKeyActivated(user);
    governance.reactivateKey();

    assertTrue(governance.isValidatorActive(keyId), "Key should be active again");

    vm.stopPrank();
  }
}
