// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {Test} from "forge-std/Test.sol";

// solhint-disable comprehensive-interface

contract BN254Fixtures is Test {
  struct FixtureData {
    uint256 fpOrder;
    uint256 frOrder;
    G1Point g1Generator;
    G2Point g2Generator;
    G1Point negativeG1Generator;
    G2Point negativeG2Generator;
    FixtureKey[] sampleKeys;
  }

  struct FixtureKey {
    G1Point negativePk1;
    G2Point negativePk2;
    G1Point pk1;
    G2Point pk2;
    uint256 sk;
  }

  FixtureData public fixtureData;

  function setUp() public virtual {
    loadFixtureData();
  }

  function signRegistrationDigest(uint256 sk) public view returns (G1Point memory) {
    G1Point memory pk1 = BN254Lib.g1Mul(BN254Lib.g1Generator(), sk);
    G1Point memory pk1DigestPoint = BN254Lib.g1ToDigestPoint(pk1);
    G1Point memory sigma = BN254Lib.g1Mul(pk1DigestPoint, sk);
    return sigma;
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
