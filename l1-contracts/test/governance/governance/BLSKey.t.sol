// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BN254} from "@aztec/governance/libraries/BN254.sol";
import {Test} from "forge-std/Test.sol";

// solhint-disable comprehensive-interface

contract BN254KeyTest is Test {
  struct FixtureData {
    uint256 fpOrder;
    uint256 frOrder;
    G1Point g1Generator;
    G2Point g2Generator;
    G2Point negativeG2Generator;
    FixtureKey[] sampleKeys;
  }

  struct G1Point {
    uint256 x;
    uint256 y;
  }

  struct G2Point {
    uint256 x0;
    uint256 x1;
    uint256 y0;
    uint256 y1;
  }

  struct FixtureKey {
    G1Point pk1;
    G2Point pk2;
    uint256 sk;
  }

  FixtureData private fixtureData;
  uint256 private sk = 0x7777777;
  uint256[2] private pk1;
  uint256[4] private pk2;
  uint256[2] private sigma;

  function setUp() public {
    loadFixtureData();
  }

  function testG1Negate() public {
    setupValidSignatures();
    uint256[2] memory negPk1 = BN254.g1Negate(pk1);
    assertEq(
      negPk1[0], 14040631920337037677709966437409651072288616613076825157749168159693185460400
    );
    assertEq(
      negPk1[1], 15603454431192162606608260818640008567921080203618567739032051225096946447435
    );
  }

  function testProofOfPossession() public {
    setupValidSignatures();

    bool ok = this.proofOfPossession(pk1, pk2, sigma);

    assertTrue(ok, "proof of possession failed");
  }

  function testInvalidPk1InProofOfPossession() public {
    setupValidSignatures();
    pk1[0]++;
    vm.expectRevert(BN254.mulPointFail.selector);
    bool ok = this.proofOfPossession(pk1, pk2, sigma);
    assertFalse(ok, "proof of possession should fail");
  }

  function testInvalidPk2InProofOfPossession() public {
    setupValidSignatures();
    pk2[0]++;
    vm.expectRevert(BN254.pairingFail.selector);
    bool ok = this.proofOfPossession(pk1, pk2, sigma);
    assertFalse(ok, "proof of possession should fail");
  }

  function testInvalidSigmaInProofOfPossession() public {
    setupValidSignatures();
    sigma[0]++;
    vm.expectRevert(BN254.addPointFail.selector);
    bool ok = this.proofOfPossession(pk1, pk2, sigma);
    assertFalse(ok, "proof of possession should fail");
  }

  function testWrongPk1InProofOfPossession(uint256 newSk) public {
    newSk = bound(newSk, 1, BN254.CURVE_ORDER - 1);
    vm.assume(newSk != sk);
    setupValidSignatures();

    pk1 = BN254.g1Negate(pk1);
    assertFalse(this.proofOfPossession(pk1, pk2, sigma), "proof of possession should fail");

    pk1 = BN254.g1Mul(BN254.g1Generator(), newSk);
    assertFalse(this.proofOfPossession(pk1, pk2, sigma), "proof of possession should fail");
  }

  function testWrongDomainSeparatorInProofOfPossession(bytes32 newDomainSeparator) public {
    vm.assume(newDomainSeparator != BN254.STAKING_DOMAIN_SEPARATOR);
    setupValidSignatures();

    sigma = BN254.g1Negate(sigma);
    assertFalse(this.proofOfPossession(pk1, pk2, sigma), "proof of possession should fail");

    bytes memory pk1Bytes = abi.encodePacked(pk1[0], pk1[1]);

    uint256[2] memory pk1DigestPoint = BN254.hashToPoint(newDomainSeparator, pk1Bytes);

    sigma = BN254.g1Mul(pk1DigestPoint, sk);
    assertFalse(this.proofOfPossession(pk1, pk2, sigma), "proof of possession should fail");
  }

  function testWrongSkWhenGeneratingSignature(uint256 newSk) public {
    newSk = bound(newSk, 1, BN254.CURVE_ORDER - 1);
    vm.assume(newSk != sk);
    setupValidSignatures();
    bytes memory pk1Bytes = abi.encodePacked(pk1[0], pk1[1]);

    uint256[2] memory pk1DigestPoint = BN254.hashToPoint(BN254.STAKING_DOMAIN_SEPARATOR, pk1Bytes);
    sigma = BN254.g1Mul(pk1DigestPoint, newSk);
    bool ok = this.proofOfPossession(pk1, pk2, sigma);
    assertFalse(ok, "proof of possession should fail");
  }

  function testZeroInputs() public {
    setupValidSignatures();
    pk1 = BN254.g1Zero();
    vm.expectRevert(BN254.pk1Zero.selector);
    this.proofOfPossession(pk1, pk2, sigma);

    setupValidSignatures();
    pk2 = BN254.g2Zero();
    vm.expectRevert(BN254.pk2Zero.selector);
    this.proofOfPossession(pk1, pk2, sigma);

    setupValidSignatures();
    sigma = BN254.g1Zero();
    vm.expectRevert(BN254.signatureZero.selector);
    this.proofOfPossession(pk1, pk2, sigma);
  }

  function setupValidSignatures() public {
    // Generate Public Key
    pk1 = BN254.g1Mul(BN254.g1Generator(), sk);
    // See yarn-project/ethereum/src/test/bn254_registration.test.ts for construction of pk2
    pk2 = [
      12000187580290590047264785709963395816646295176893602234201956783324175839805,
      17931071651819835067098563222910421513876328033572114834306979690881549564414,
      3847186948811352011829434621581350901968531448585779990319356482934947911409,
      9611549517545166944736557219282359806761534888544046901025233666228290030286
    ];
    bytes memory pk1Bytes = abi.encodePacked(pk1[0], pk1[1]);

    uint256[2] memory pk1DigestPoint = BN254.hashToPoint(BN254.STAKING_DOMAIN_SEPARATOR, pk1Bytes);

    sigma = BN254.g1Mul(pk1DigestPoint, sk);
  }

  function testPairingOfGenerators() public view {
    // The generator points are given in:
    // https://eips.ethereum.org/EIPS/eip-197#definition-of-the-groups

    uint256[4] memory g2 = [
      11559732032986387107991004021392285783925812861821192530917403151452391805634,
      10857046999023057135944570762232829481370756359578518086990519993285655852781,
      4082367875863433681332203403145435568316851327593401208105741076214120093531,
      8495653923123431417604973247489272438418190587263600148770280649306958101930
    ];

    // Sanity Check
    assertTrue(
      bn254Pairing(BN254.g1Generator(), BN254.g2NegatedGenerator(), BN254.g1Generator(), g2),
      "Pairing of generators failed"
    );
  }

  // wrapper for negative testing
  function bn254Pairing(
    uint256[2] memory _l,
    uint256[4] memory _g2a,
    uint256[2] memory _r,
    uint256[4] memory _g2b
  ) public view returns (bool ok) {
    return BN254.bn254Pairing(_l, _g2a, _r, _g2b);
  }

  // wrapper for negative testing
  function proofOfPossession(
    uint256[2] memory _pk1,
    uint256[4] memory _pk2,
    uint256[2] memory _sigma
  ) public view returns (bool ok) {
    return BN254.proofOfPossession(_pk1, _pk2, _sigma);
  }

  function loadFixtureData() internal view {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/test/fixtures/bn254_constants.json");
    string memory json = vm.readFile(path);
    bytes memory jsonBytes = vm.parseJson(json);
    FixtureData memory data = abi.decode(jsonBytes, (FixtureData));
  }
}
