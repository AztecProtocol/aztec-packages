// SPDX-License-Identifier: Apache-2.0
// Copyright 2024 Aztec Labs.
pragma solidity >=0.8.27;

import {BN254Lib, G1Point, G2Point} from "@aztec/shared/libraries/BN254Lib.sol";
import {IBn254LibWrapper} from "./interfaces/IBn254LibWrapper.sol";

contract Bn254LibWrapper is IBn254LibWrapper {
  function proofOfPossession(
    G1Point memory _publicKeyInG1,
    G2Point memory _publicKeyInG2,
    G1Point memory _proofOfPossession
  ) external view override(IBn254LibWrapper) returns (bool) {
    return BN254Lib.proofOfPossession(_publicKeyInG1, _publicKeyInG2, _proofOfPossession);
  }

  function g1ToDigestPoint(G1Point memory pk1) external view override(IBn254LibWrapper) returns (G1Point memory) {
    return BN254Lib.g1ToDigestPoint(pk1);
  }
}
