// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Aztec Labs.
pragma solidity >=0.8.27;

import {Test} from "forge-std/Test.sol";
import {stdJson} from "forge-std/StdJson.sol";

import {GSE} from "@aztec/governance/GSE.sol";
import {ProofOfPossessionPreflight} from "@aztec/periphery/ProofOfPossessionPreflight.sol";
import {PopPreflightResult, PopPreflightStatus} from "@aztec/periphery/interfaces/IProofOfPossessionPreflight.sol";
import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";

/**
 * @notice Checks that a deploy script deployed the proof of possession preflight helper, emitted its address and
 *         that it works against the deployed GSE.
 */
abstract contract PreflightDeployChecks is Test {
  using stdJson for string;

  function _assertPreflightDeployed(ProofOfPossessionPreflight _preflight, GSE _gse, string memory _deploymentJson)
    internal
  {
    assertGt(address(_preflight).code.length, 0, "preflight not deployed");
    assertEq(
      _deploymentJson.readAddress(".proofOfPossessionPreflightAddress"),
      address(_preflight),
      "preflight address not emitted"
    );

    // A fixture key, signed over the digest the deployed GSE gives for it.
    string memory fixtures = vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/bn254_constants.json"));
    uint256 sk = fixtures.readUint(".sampleKeys[0].sk");
    G2Point memory pk2 = G2Point({
      x0: fixtures.readUint(".sampleKeys[0].pk2.x0"),
      x1: fixtures.readUint(".sampleKeys[0].pk2.x1"),
      y0: fixtures.readUint(".sampleKeys[0].pk2.y0"),
      y1: fixtures.readUint(".sampleKeys[0].pk2.y1")
    });
    G1Point memory pk1 = BN254Lib.g1Mul(BN254Lib.g1Generator(), sk);
    G1Point memory sig = BN254Lib.g1Mul(_gse.getRegistrationDigest(pk1), sk);

    PopPreflightResult memory result = _preflight.checkProofOfPossession(_gse, pk1, pk2, sig);
    assertEq(uint8(result.status), uint8(PopPreflightStatus.Valid), "status");
    assertEq(result.cap, _gse.proofOfPossessionGasLimit(), "cap");
    assertEq(result.wrapper, vm.computeCreateAddress(address(_gse), 1), "wrapper");

    sig = BN254Lib.g1Mul(_gse.getRegistrationDigest(pk1), sk + 1);
    assertEq(
      uint8(_preflight.checkProofOfPossession(_gse, pk1, pk2, sig).status),
      uint8(PopPreflightStatus.Invalid),
      "status with a wrong signature"
    );
  }
}
