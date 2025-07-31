// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BLS} from "@aztec/governance/libraries/BLS.sol";
import {Test} from "forge-std/Test.sol";

// solhint-disable comprehensive-interface

contract BLSKeyTest is Test {
  uint256 private sk = 0x7777777;
  uint256[2] private pk1;
  uint256[4] private pk2;
  uint256[2] private sigma;

  // Events from IGovernance interface
  event BlsKeyActivated(address indexed account);
  event BlsKeyDeactivated(address indexed account);

  function testProofOfPossession() public {
    setupValidSignatures();

    bool ok = this.proofOfPossession(pk1, pk2, sigma);

    assertTrue(ok, "proof of possession failed");
  }

  function testInvalidPk1InProofOfPossession() public {
    setupValidSignatures();
    pk1[0]++;
    vm.expectRevert(BLS.mulPointFail.selector);
    bool ok = this.proofOfPossession(pk1, pk2, sigma);
    assertFalse(ok, "proof of possession should fail");
  }

  function testInvalidPk2InProofOfPossession() public {
    setupValidSignatures();
    pk2[0]++;
    vm.expectRevert(BLS.pairingFail.selector);
    bool ok = this.proofOfPossession(pk1, pk2, sigma);
    assertFalse(ok, "proof of possession should fail");
  }

  function testInvalidSigmaInProofOfPossession() public {
    setupValidSignatures();
    sigma[0]++;
    vm.expectRevert(BLS.addPointFail.selector);
    bool ok = this.proofOfPossession(pk1, pk2, sigma);
    assertFalse(ok, "proof of possession should fail");
  }

  function testWrongPk1InProofOfPossession(uint256 newSk) public {
    newSk = bound(newSk, 1, BLS.CURVE_ORDER - 1);
    vm.assume(newSk != sk);
    setupValidSignatures();
    pk1 = BLS.ecMul([BLS.G1_X, BLS.G1_Y], newSk);
    bool ok = this.proofOfPossession(pk1, pk2, sigma);
    assertFalse(ok, "proof of possession should fail");
  }

  function testWrongDomainSeparatorInProofOfPossession(bytes32 newDomainSeparator) public {
    vm.assume(newDomainSeparator != BLS.STAKING_DOMAIN_SEPARATOR);
    setupValidSignatures();

    bytes memory pk1Bytes = abi.encodePacked(pk1[0], pk1[1]);

    uint256[2] memory pk1DigestPoint = BLS.hashToPoint(newDomainSeparator, pk1Bytes);

    sigma = BLS.ecMul(pk1DigestPoint, sk);
    bool ok = this.proofOfPossession(pk1, pk2, sigma);
    assertFalse(ok, "proof of possession should fail");
  }

  function testWrongSkWhenGeneratingSignature(uint256 newSk) public {
    newSk = bound(newSk, 1, BLS.CURVE_ORDER - 1);
    vm.assume(newSk != sk);
    setupValidSignatures();
    bytes memory pk1Bytes = abi.encodePacked(pk1[0], pk1[1]);

    uint256[2] memory pk1DigestPoint = BLS.hashToPoint(BLS.STAKING_DOMAIN_SEPARATOR, pk1Bytes);
    sigma = BLS.ecMul(pk1DigestPoint, newSk);
    bool ok = this.proofOfPossession(pk1, pk2, sigma);
    assertFalse(ok, "proof of possession should fail");
  }

  function testZeroInputs() public {
    setupValidSignatures();
    pk1 = [uint256(0), uint256(0)];
    vm.expectRevert(BLS.pk1Zero.selector);
    this.proofOfPossession(pk1, pk2, sigma);

    setupValidSignatures();
    pk2 = [uint256(0), uint256(0), uint256(0), uint256(0)];
    vm.expectRevert(BLS.pk2Zero.selector);
    this.proofOfPossession(pk1, pk2, sigma);

    setupValidSignatures();
    sigma = [uint256(0), uint256(0)];
    vm.expectRevert(BLS.signatureZero.selector);
    this.proofOfPossession(pk1, pk2, sigma);
  }

  function setupValidSignatures() public {
    // Generate Public Key
    pk1 = BLS.ecMul([BLS.G1_X, BLS.G1_Y], sk);
    // See yarn-project/ethereum/src/test/bn254_registration.test.ts for construction of pk2
    pk2 = [
      12000187580290590047264785709963395816646295176893602234201956783324175839805,
      17931071651819835067098563222910421513876328033572114834306979690881549564414,
      3847186948811352011829434621581350901968531448585779990319356482934947911409,
      9611549517545166944736557219282359806761534888544046901025233666228290030286
    ];
    bytes memory pk1Bytes = abi.encodePacked(pk1[0], pk1[1]);

    uint256[2] memory pk1DigestPoint = BLS.hashToPoint(BLS.STAKING_DOMAIN_SEPARATOR, pk1Bytes);

    sigma = BLS.ecMul(pk1DigestPoint, sk);
  }

  function testPairingOfGenerators() public view {
    // The generator points are given in:
    // https://eips.ethereum.org/EIPS/eip-197#definition-of-the-groups
    uint256[2] memory g1 = [uint256(1), uint256(2)];

    uint256[4] memory g2 = [
      11559732032986387107991004021392285783925812861821192530917403151452391805634,
      10857046999023057135944570762232829481370756359578518086990519993285655852781,
      4082367875863433681332203403145435568316851327593401208105741076214120093531,
      8495653923123431417604973247489272438418190587263600148770280649306958101930
    ];

    // Sanity Check
    assertTrue(
      bn254Pairing(
        g1, [BLS.NEG_G2_X1, BLS.NEG_G2_X0, BLS.NEG_G2_Y1, BLS.NEG_G2_Y0], [BLS.G1_X, BLS.G1_Y], g2
      ),
      "Pairing of generators failed"
    );
  }

  // wrapper for positive testing
  function bn254Pairing(
    uint256[2] memory _l, // G1
    uint256[4] memory _g2a, // G2  (x1,x0,y1,y0 order for precompile!)
    uint256[2] memory _r, // G1
    uint256[4] memory _g2b // G2
  ) public view returns (bool ok) {
    return BLS.bn254Pairing(_l, _g2a, _r, _g2b);
  }

  // wrapper for negative testing
  function proofOfPossession(
    uint256[2] memory _pk1,
    uint256[4] memory _pk2,
    uint256[2] memory _sigma
  ) public view returns (bool ok) {
    return BLS.proofOfPossession(_pk1, _pk2, _sigma);
  }
}
