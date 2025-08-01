// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BN254Lib} from "@aztec/shared/libraries/BN254Lib.sol";
import {Test} from "forge-std/Test.sol";

// solhint-disable comprehensive-interface

contract BN254KeyTest is Test {
  struct FixtureData {
    uint256 fpOrder;
    uint256 frOrder;
    BN254Lib.G1Point g1Generator;
    BN254Lib.G2Point g2Generator;
    BN254Lib.G1Point negativeG1Generator;
    BN254Lib.G2Point negativeG2Generator;
    FixtureKey[] sampleKeys;
  }

  struct FixtureKey {
    BN254Lib.G1Point negativePk1;
    BN254Lib.G2Point negativePk2;
    BN254Lib.G1Point pk1;
    BN254Lib.G2Point pk2;
    uint256 sk;
  }

  FixtureData private fixtureData;

  function setUp() public {
    loadFixtureData();
  }

  function testInvalidPk1InProofOfPossession() public {
    for (uint256 i = 0; i < fixtureData.sampleKeys.length; i++) {
      FixtureKey memory key = fixtureData.sampleKeys[i];
      key.pk1.x++;
      BN254Lib.G1Point memory sigma = this.signRegistrationDigest(key.sk);
      vm.expectRevert(BN254Lib.mulPointFail.selector);
      // need to set the gas since the precompile uses everything given to it
      // if it fails
      this.proofOfPossession{gas: 100000}(key.pk1, key.pk2, sigma);
    }
  }

  function testInvalidPk2InProofOfPossession() public {
    for (uint256 i = 0; i < fixtureData.sampleKeys.length; i++) {
      FixtureKey memory key = fixtureData.sampleKeys[i];
      key.pk2.x0++;
      BN254Lib.G1Point memory sigma = signRegistrationDigest(key.sk);
      vm.expectRevert(BN254Lib.pairingFail.selector);
      this.proofOfPossession{gas: 100000}(key.pk1, key.pk2, sigma);
    }
  }

  function testInvalidSigmaInProofOfPossession() public {
    for (uint256 i = 0; i < fixtureData.sampleKeys.length; i++) {
      FixtureKey memory key = fixtureData.sampleKeys[i];
      BN254Lib.G1Point memory sigma = signRegistrationDigest(key.sk);
      sigma.x++;
      vm.expectRevert(BN254Lib.addPointFail.selector);
      this.proofOfPossession{gas: 100000}(key.pk1, key.pk2, sigma);
    }
  }

  function testZeroAndNegativeInputsInProofOfPossession() public {
    for (uint256 i = 0; i < fixtureData.sampleKeys.length; i++) {
      FixtureKey memory key = fixtureData.sampleKeys[i];

      BN254Lib.G1Point memory sigma = signRegistrationDigest(key.sk);

      vm.expectRevert(BN254Lib.pk1Zero.selector);
      this.proofOfPossession(BN254Lib.g1Zero(), key.pk2, sigma);

      vm.expectRevert(BN254Lib.pk2Zero.selector);
      this.proofOfPossession(key.pk1, BN254Lib.g2Zero(), sigma);

      vm.expectRevert(BN254Lib.signatureZero.selector);
      this.proofOfPossession(key.pk1, key.pk2, BN254Lib.g1Zero());

      assertFalse(
        this.proofOfPossession(key.negativePk1, key.pk2, sigma), "proof of possession should fail"
      );
      assertFalse(
        this.proofOfPossession(key.pk1, key.negativePk2, sigma), "proof of possession should fail"
      );
      assertFalse(
        this.proofOfPossession(key.negativePk1, key.negativePk2, sigma),
        "proof of possession should fail"
      );
      assertFalse(
        this.proofOfPossession(key.pk1, key.pk2, BN254Lib.g1Negate(sigma)),
        "proof of possession should fail"
      );
      assertFalse(
        this.proofOfPossession(key.negativePk1, key.negativePk2, BN254Lib.g1Negate(sigma)),
        "proof of possession should fail"
      );
    }
  }

  function testConstants() public view {
    assertEq(BN254Lib.BASE_FIELD_ORDER, fixtureData.fpOrder);
    assertEq(BN254Lib.GROUP_ORDER, fixtureData.frOrder);

    BN254Lib.G1Point memory g1Generator = BN254Lib.g1Generator();
    assertEq(g1Generator.x, fixtureData.g1Generator.x);
    assertEq(g1Generator.y, fixtureData.g1Generator.y);

    BN254Lib.G2Point memory negativeG2Generator = BN254Lib.g2NegatedGenerator();
    assertEq(negativeG2Generator.x0, fixtureData.negativeG2Generator.x0);
    assertEq(negativeG2Generator.x1, fixtureData.negativeG2Generator.x1);
    assertEq(negativeG2Generator.y0, fixtureData.negativeG2Generator.y0);
    assertEq(negativeG2Generator.y1, fixtureData.negativeG2Generator.y1);
  }

  function testG1Negate() public view {
    BN254Lib.G1Point memory negatedZero = BN254Lib.g1Negate(BN254Lib.g1Zero());
    assertEq(negatedZero.x, 0);
    assertEq(negatedZero.y, 0);

    BN254Lib.G1Point memory negatedGenerator = BN254Lib.g1Negate(BN254Lib.g1Generator());
    assertEq(negatedGenerator.x, fixtureData.negativeG1Generator.x);
    assertEq(negatedGenerator.y, fixtureData.negativeG1Generator.y);

    for (uint256 i = 0; i < fixtureData.sampleKeys.length; i++) {
      FixtureKey memory key = fixtureData.sampleKeys[i];
      BN254Lib.G1Point memory negPk1 = BN254Lib.g1Negate(key.pk1);
      assertEq(negPk1.x, key.negativePk1.x);
      assertEq(negPk1.y, key.negativePk1.y);
    }
  }

  function testProofOfPossession() public view {
    for (uint256 i = 0; i < fixtureData.sampleKeys.length; i++) {
      FixtureKey memory key = fixtureData.sampleKeys[i];
      BN254Lib.G1Point memory sigma = signRegistrationDigest(key.sk);
      assertTrue(this.proofOfPossession(key.pk1, key.pk2, sigma), "proof of possession failed");
    }
  }

  /// forge-config: default.fuzz.runs = 8
  function testWrongSkInProofOfPossession(uint256 newSk) public view {
    for (uint256 i = 0; i < fixtureData.sampleKeys.length; i++) {
      FixtureKey memory key = fixtureData.sampleKeys[i];

      BN254Lib.G1Point memory sigma = signRegistrationDigest(key.sk);

      newSk = bound(newSk, 1, BN254Lib.GROUP_ORDER - 1);
      // It may happen that we get very unlucky and draw the same secret key.
      if (newSk == key.sk) {
        newSk = newSk + 1 % BN254Lib.GROUP_ORDER;
      }

      BN254Lib.G1Point memory wrongPk1 = BN254Lib.g1Mul(BN254Lib.g1Generator(), newSk);
      assertFalse(
        this.proofOfPossession(wrongPk1, key.pk2, sigma), "proof of possession should fail"
      );

      BN254Lib.G1Point memory wrongSigma = signRegistrationDigest(newSk);
      assertFalse(
        this.proofOfPossession(key.pk1, key.pk2, wrongSigma), "proof of possession should fail"
      );
    }
  }

  /// forge-config: default.fuzz.runs = 4
  function testWrongDomainSeparatorInProofOfPossession(bytes32 newDomainSeparator) public view {
    vm.assume(newDomainSeparator != BN254Lib.STAKING_DOMAIN_SEPARATOR);
    for (uint256 i = 0; i < fixtureData.sampleKeys.length; i++) {
      FixtureKey memory key = fixtureData.sampleKeys[i];
      bytes memory pk1Bytes = abi.encodePacked(key.pk1.x, key.pk1.y);
      BN254Lib.G1Point memory pk1DigestPoint = BN254Lib.hashToPoint(newDomainSeparator, pk1Bytes);
      BN254Lib.G1Point memory sigma = BN254Lib.g1Mul(pk1DigestPoint, key.sk);
      assertFalse(
        this.proofOfPossession(key.pk1, key.pk2, sigma), "proof of possession should fail"
      );
    }
  }

  function testPairingOfGenerators() public view {
    // The generator points are given in:
    // https://eips.ethereum.org/EIPS/eip-197#definition-of-the-groups

    BN254Lib.G2Point memory g2 = BN254Lib.G2Point({
      x1: 11559732032986387107991004021392285783925812861821192530917403151452391805634,
      x0: 10857046999023057135944570762232829481370756359578518086990519993285655852781,
      y1: 4082367875863433681332203403145435568316851327593401208105741076214120093531,
      y0: 8495653923123431417604973247489272438418190587263600148770280649306958101930
    });

    assertEq(g2.x0, fixtureData.g2Generator.x0);
    assertEq(g2.x1, fixtureData.g2Generator.x1);
    assertEq(g2.y0, fixtureData.g2Generator.y0);
    assertEq(g2.y1, fixtureData.g2Generator.y1);

    // Sanity Check
    assertTrue(
      bn254Pairing(
        BN254Lib.g1Generator(), BN254Lib.g2NegatedGenerator(), BN254Lib.g1Generator(), g2
      ),
      "Pairing of generators failed"
    );
  }

  //############################//
  //      Helper Functions      //
  //############################//

  function signRegistrationDigest(uint256 sk) public view returns (BN254Lib.G1Point memory) {
    BN254Lib.G1Point memory pk1 = BN254Lib.g1Mul(BN254Lib.g1Generator(), sk);
    bytes memory pk1Bytes = abi.encodePacked(pk1.x, pk1.y);

    BN254Lib.G1Point memory pk1DigestPoint =
      BN254Lib.hashToPoint(BN254Lib.STAKING_DOMAIN_SEPARATOR, pk1Bytes);

    BN254Lib.G1Point memory sigma = BN254Lib.g1Mul(pk1DigestPoint, sk);
    return sigma;
  }

  // wrapper for negative testing
  function bn254Pairing(
    BN254Lib.G1Point memory _g1a,
    BN254Lib.G2Point memory _g2a,
    BN254Lib.G1Point memory _g1b,
    BN254Lib.G2Point memory _g2b
  ) public view returns (bool ok) {
    return BN254Lib.bn254Pairing(_g1a, _g2a, _g1b, _g2b);
  }

  // wrapper for negative testing
  function proofOfPossession(
    BN254Lib.G1Point memory _pk1,
    BN254Lib.G2Point memory _pk2,
    BN254Lib.G1Point memory _sigma
  ) public view returns (bool ok) {
    return BN254Lib.proofOfPossession(_pk1, _pk2, _sigma);
  }

  function loadFixtureData() internal {
    string memory root = vm.projectRoot();
    string memory path = string.concat(root, "/test/fixtures/bn254_constants.json");
    string memory json = vm.readFile(path);
    bytes memory jsonBytes = vm.parseJson(json);
    FixtureData memory data = abi.decode(jsonBytes, (FixtureData));
    fixtureData.fpOrder = data.fpOrder;
    fixtureData.frOrder = data.frOrder;
    fixtureData.g1Generator = data.g1Generator;
    fixtureData.g2Generator = data.g2Generator;
    fixtureData.negativeG1Generator = data.negativeG1Generator;
    fixtureData.negativeG2Generator = data.negativeG2Generator;

    // you cannot copy memory arrays, so we need to push each element
    for (uint256 i = 0; i < data.sampleKeys.length; i++) {
      fixtureData.sampleKeys.push(data.sampleKeys[i]);
    }
    assertEq(fixtureData.sampleKeys.length, 50, "sampleKeys length mismatch");
  }
}
